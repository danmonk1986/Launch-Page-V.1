import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { FormActions, Sheet } from './Sheet';
import { addDays, layoutWeek, weekStart, type CalEvent, type EventColor } from '../lib/events';
import { isoDate } from '../lib/launchers';
import { colorForCalendar, type Project } from '../lib/projects';
import {
  connectGoogle,
  createGoogleEvent,
  deleteGoogleEvent,
  disconnectGoogle,
  GoogleAuthError,
  googleConfigured,
  hasToken,
  listGoogleEvents,
  preloadGoogle,
  updateGoogleEvent,
  wasConnected
} from '../lib/google';
import { clearCached, dropCached, lastSynced, loadCached, putCached, syncRange } from '../lib/gcalCache';

type Props = {
  /** Signed-in user, for the kept copy of Google events. */
  userId: string | null;
  /** Bumped by the gear menu's "Disconnect Google Calendar". */
  disconnectTick?: number;
  onDisconnected?: () => void;
  events: CalEvent[];
  /** Areas and projects: a linked calendar's events take its colour. */
  projects?: Project[];
  /** Told whenever Google's calendar list has been read. */
  onCalendars?: () => void;
  onSave: (e: CalEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStatus?: (msg: string) => void;
};

const COLORS: EventColor[] = ['teal', 'purple', 'blue'];

type GState = 'off' | 'reconnect' | 'loading' | 'on';

/** Sunday to Saturday. Multi-day events span their days; click a day to add, an event to edit. */
export function WeekCalendar({ userId, disconnectTick = 0, onDisconnected, events, projects = [], onCalendars, onSave, onDelete, onStatus }: Props) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [gEvents, setGEvents] = useState<CalEvent[]>([]);
  const [g, setG] = useState<GState>(() => (!googleConfigured() ? 'off' : hasToken() ? 'loading' : wasConnected() ? 'reconnect' : 'off'));
  const [gError, setGError] = useState<string | null>(null);

  const today = isoDate(new Date());
  const start = addDays(weekStart(new Date()), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const from = isoDate(days[0]);
  const to = isoDate(days[6]);

  useEffect(preloadGoogle, []);

  // Google events kept in LaunchPage show straight away; syncing refreshes them.
  const kept = useRef<CalEvent[]>([]);
  const keep = (list: CalEvent[]) => {
    kept.current = list;
    setGEvents(list);
  };
  useEffect(() => {
    let live = true;
    loadCached(userId).then((list) => live && keep(list));
    return () => {
      live = false;
    };
  }, [userId]);

  /** Reads Google and updates the kept copy. wide = 2 weeks back to 8 weeks ahead; otherwise just this week. */
  const refresh = useCallback(
    async (wide = false) => {
      if (!hasToken()) {
        setG(wasConnected() ? 'reconnect' : 'off');
        return;
      }
      setG('loading');
      const a = wide ? isoDate(addDays(start, -14)) : from;
      const b = wide ? isoDate(addDays(start, 7 * 8 + 6)) : to;
      try {
        const fresh = await listGoogleEvents(a, b);
        keep(await syncRange(userId, kept.current, a, b, fresh));
        onCalendars?.();
        setGError(null);
        setG('on');
      } catch (err) {
        if (err instanceof GoogleAuthError) setG('reconnect');
        else {
          setGError((err as Error).message);
          setG('on');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, userId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pick up changes made in Google while LaunchPage stays open.
  useEffect(() => {
    if (g !== 'on') return;
    const t = window.setInterval(() => refresh(true), 5 * 60_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [g, refresh]);

  /** The calendar button: sync now (signing in to Google first if the hour-long pass ran out). */
  async function sync() {
    try {
      if (!hasToken()) {
        await connectGoogle();
        onStatus?.('Google Calendar connected.');
      }
      await refresh(true);
      onStatus?.('Calendar synced with Google.');
    } catch (err) {
      onStatus?.((err as Error).message);
    }
  }

  async function disconnect() {
    await disconnectGoogle();
    await clearCached(userId);
    keep([]);
    setG('off');
    onDisconnected?.();
    onStatus?.('Google Calendar disconnected.');
  }
  useEffect(() => {
    if (disconnectTick > 0) disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectTick]);

  /** Runs a Google change; if the hour-long pass ran out, renews it (this is a click) and tries once more. */
  async function withGoogle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof GoogleAuthError)) throw err;
      await connectGoogle();
      setG('on');
      return fn();
    }
  }

  const all = [...events, ...gEvents];
  // Themes (like CONSISTENCY or AUDACITY): one-day, all-day events with the same name 7+ days in a row
  // anywhere in what's synced. Worked out fresh each time, so a Sync never changes the answer and
  // ordinary repeating tasks (a weekly download, a sprint) aren't mistaken for themes.
  const dayMs = 86_400_000;
  const dateNum = (d: string) => Math.round(new Date(`${d}T12:00:00`).getTime() / dayMs);
  const byTitle = new Map<string, Set<number>>();
  for (const e of all) {
    if (e.google?.time || e.startDate !== e.endDate) continue;
    const k = e.title.trim().toLowerCase();
    byTitle.set(k, (byTitle.get(k) ?? new Set()).add(dateNum(e.startDate)));
  }
  const themeTitles = new Set<string>();
  for (const [k, set] of byTitle) {
    const sorted = [...set].sort((a, b) => a - b);
    let run = 1;
    for (let n = 1; n < sorted.length && run < 7; n++) run = sorted[n] === sorted[n - 1] + 1 ? run + 1 : 1;
    if (sorted.length >= 7 && run >= 7) themeTitles.add(k);
  }
  // NORTH STAR: every all-day event on that calendar is a theme, however many days are synced.
  const northStarCals = new Set(projects.filter((p) => /^north\s*star$/i.test(p.name.trim()) && p.calendarId).map((p) => p.calendarId as string));
  const onNorthStar = (e: CalEvent) => !!e.google && (northStarCals.has(e.google.calendarId) || /^north\s*star$/i.test((e.google.calendar ?? '').trim()));
  const isTheme = (e: CalEvent) =>
    !e.google?.time && (onNorthStar(e) || (e.startDate === e.endDate && themeTitles.has(e.title.trim().toLowerCase())));
  // One tile per day (Oct 20): anything that runs over several days, themes and the North
  // Star included, shows as its own tile on each day it covers instead of one stretched bar.
  const weekDays = days.map(isoDate);
  const original = new Map<string, CalEvent>();
  const perDay = (list: CalEvent[]) => {
    const out: CalEvent[] = [];
    const seen = new Set<string>();
    for (const e of list) {
      for (const day of weekDays) {
        if (day < e.startDate || day > e.endDate) continue;
        const id = e.startDate === e.endDate ? e.id : `${e.id}@${day}`;
        const dupe = `${e.title.trim().toLowerCase()}@${day}`;
        if (isTheme(e) && seen.has(dupe)) continue;
        seen.add(dupe);
        original.set(id, e);
        out.push({ ...e, id, startDate: day, endDate: day });
      }
    }
    return out;
  };
  const main = layoutWeek(perDay(all.filter((e) => !isTheme(e))), start);
  const mainLanes = main.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  const themes = layoutWeek(perDay(all.filter(isTheme)), start).map((p) => ({ ...p, lane: p.lane + mainLanes, theme: true }));
  const placed = [...main, ...themes];
  const lanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  const end = days[6];
  const range = `${start.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', {
    month: start.getMonth() === end.getMonth() ? undefined : 'long',
    day: 'numeric'
  })}`;

  return (
    <section className="panel panel-week" aria-labelledby="h-week">
      <div className="panel-head">
        <h2 id="h-week" className="panel-title" title={range}>
          {offset === 0 ? (
            'This week'
          ) : (
            <button type="button" className="title-btn" title="Back to this week" onClick={() => setOffset(0)}>
              {offset === 1
                ? 'Next week'
                : offset === -1
                  ? 'Last week'
                  : `Week of ${start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`}
            </button>
          )}
        </h2>
        <div className="panel-actions week-tools">
          <button type="button" className="week-arrow" aria-label="Previous week" title="Previous week" onClick={() => setOffset((o) => o - 1)}>
            {"<"}
          </button>
          {googleConfigured() && (
            <button
              type="button"
              className={`icon-btn tool-btn gcal-sync ${g === 'on' || g === 'loading' ? 'gcal-on' : 'gcal-off'}${g === 'loading' ? ' is-syncing' : ''}`}
              aria-label="Sync with Google Calendar"
              title={
                g === 'loading'
                  ? 'Syncing…'
                  : `Sync with Google Calendar${lastSynced() ? ` · last synced ${lastSynced()!.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`
              }
              disabled={g === 'loading'}
              onClick={sync}
            >
              <Icon d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4h-4M5.5 21v-4h4" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add event"
            title="Add event"
            onClick={() => {
              setEditing(null);
              setNewDate(offset === 0 ? today : from);
              setOpen(true);
            }}
          >
            <Icon d="M12 5v14M5 12h14" />
          </button>
          <button type="button" className="week-arrow" aria-label="Next week" title="Next week" onClick={() => setOffset((o) => o + 1)}>
            {">"}
          </button>
        </div>
      </div>

      {gError && <p className="panel-empty">{gError}</p>}

      <div className="week-scroll">
        <div className="week-grid" style={{ gridTemplateRows: `auto repeat(${Math.max(lanes, 1)}, 24px)` }}>
          {days.map((d, i) => {
            const iso = isoDate(d);
            return (
              <button
                key={iso}
                type="button"
                className={`week-day${iso === today ? ' is-today' : ''}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
                aria-label={`Add an event on ${d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}`}
                onClick={() => {
                  setEditing(null);
                  setNewDate(iso);
                  setOpen(true);
                }}
              >
                <span className="week-dow">{d.toLocaleDateString('en-CA', { weekday: 'short' }).replace('.', '')}</span>
                <span className="week-num">{d.getDate()}</span>
              </button>
            );
          })}
          {placed.map(({ event, lane, from: f, to: t, ...rest }) => (
            <button
              key={event.id}
              type="button"
              className={`week-event ev-${event.google ? 'google' : event.color}${'theme' in rest ? ' ev-theme' : ''}`}
              style={{
                gridColumn: `${f} / ${t + 1}`,
                gridRow: lane + 2,
                ...(event.google
                  ? { borderLeftColor: colorForCalendar(projects, event.google.calendarId) ?? event.google.color ?? undefined }
                  : {})
              }}
              // The time sits in the hover and the editor, so the tile has room for the title (Oct 20).
              title={`${event.google?.time ? `${event.google.time} · ` : ''}${event.title}${event.google ? ` · ${event.google.calendar ?? 'Google Calendar'}` : ''}`}
              onClick={() => {
                setEditing(original.get(event.id) ?? event);
                setOpen(true);
              }}
            >
              {event.title}
            </button>
          ))}
        </div>
        {placed.length === 0 && <p className="panel-empty week-empty">Nothing this week yet. Tap a day to add an event.</p>}
      </div>

      <Sheet open={open} title={editing ? `Edit ${editing.title}` : 'Add event'} onClose={() => setOpen(false)}>
        <EventForm
          key={editing?.id ?? `new-${newDate}`}
          event={editing}
          date={newDate ?? today}
          googleOn={g === 'on' || g === 'reconnect'}
          onCancel={() => setOpen(false)}
          onSave={async (e, toGoogle) => {
            try {
              if (e.google) {
                const saved = await withGoogle(() => updateGoogleEvent(e));
                keep(await putCached(userId, kept.current, saved));
                onStatus?.(`${saved.title} updated in Google Calendar.`);
              } else if (toGoogle) {
                const saved = await withGoogle(() => createGoogleEvent(e));
                keep(await putCached(userId, kept.current, saved));
                onStatus?.(`${saved.title} added to Google Calendar.`);
              } else {
                await onSave(e);
              }
              setOpen(false);
            } catch (err) {
              onStatus?.((err as Error).message);
            }
          }}
          onDelete={async (ev) => {
            try {
              if (ev.google) {
                await withGoogle(() => deleteGoogleEvent(ev));
                keep(await dropCached(userId, kept.current, ev));
                onStatus?.(`${ev.title} deleted from Google Calendar.`);
              } else {
                await onDelete(ev.id);
              }
              setOpen(false);
            } catch (err) {
              onStatus?.((err as Error).message);
            }
          }}
        />
      </Sheet>
    </section>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function EventForm({
  event,
  date,
  googleOn,
  onSave,
  onDelete
}: {
  event: CalEvent | null;
  date: string;
  googleOn: boolean;
  onCancel?: () => void;
  onSave: (e: CalEvent, toGoogle: boolean) => Promise<void>;
  onDelete: (e: CalEvent) => Promise<void>;
}) {
  const [d, setD] = useState<CalEvent>(
    () => event ?? { id: crypto.randomUUID(), title: '', startDate: date, endDate: date, color: 'teal', sort: 0 }
  );
  const [toGoogle, setToGoogle] = useState(googleOn);
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setD((x) => ({ ...x, [k]: v }));
  const isGoogle = !!d.google;
  const readOnly = !!d.google?.readOnly;
  const timed = !!d.google?.time;
  const google = isGoogle || (!event && toGoogle);

  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const endDate = d.endDate < d.startDate ? d.startDate : d.endDate;
        await onSave({ ...d, title: d.title.trim(), endDate }, !event && toGoogle);
      }}
    >
      <label className="field">
        <span>Event</span>
        <input required readOnly={readOnly} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Pay mid-month bills" />
      </label>
      {isGoogle && d.google?.calendar && (
        <p className="field-hint event-when">
          From {d.google.calendar}
          {readOnly ? ' (view only).' : '.'}
        </p>
      )}
      {timed || readOnly ? (
        <p className="field-hint event-when">
          {new Date(`${d.startDate}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
          {d.google?.time ? ` at ${d.google.time}. Change the time in Google Calendar.` : d.endDate !== d.startDate ? ` to ${new Date(`${d.endDate}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}.` : '.'}
        </p>
      ) : (
        <div className="time-grid">
          <label className="field">
            <span>Starts</span>
            <input
              type="date"
              required
              value={d.startDate}
              onChange={(e) => {
                const v = e.target.value;
                setD((x) => ({ ...x, startDate: v, endDate: x.endDate < v ? v : x.endDate }));
              }}
            />
          </label>
          <label className="field">
            <span>Ends</span>
            <input type="date" required min={d.startDate} value={d.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </label>
        </div>
      )}
      {!event && googleOn && (
        <fieldset className="field">
          <legend>Save to</legend>
          <div className="choice-row">
            <label className="choice">
              <input type="radio" name="event-dest" checked={!toGoogle} onChange={() => setToGoogle(false)} />
              <span>LaunchPage</span>
            </label>
            <label className="choice">
              <input type="radio" name="event-dest" checked={toGoogle} onChange={() => setToGoogle(true)} />
              <span>Google Calendar</span>
            </label>
          </div>
        </fieldset>
      )}
      {!google && (
        <fieldset className="field">
          <legend>Colour</legend>
          <div className="choice-row">
            {COLORS.map((c) => (
              <label key={c} className="choice">
                <input type="radio" name="event-color" checked={d.color === c} onChange={() => set('color', c)} />
                <span className={`swatch-dot ev-${c}`} aria-hidden="true" />
                <span>{c === 'teal' ? 'Teal' : c === 'purple' ? 'Purple' : 'Blue'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isGoogle && d.google?.link && (
        <p className="field-hint">
          <a href={d.google.link} target="_blank" rel="noopener noreferrer" className="link-btn link-btn-inline">
            Open in Google Calendar
          </a>
        </p>
      )}
      <FormActions formId={formId} hideSave={readOnly} saveDisabled={!d.title.trim()} onDelete={event && !readOnly ? () => onDelete(event) : undefined} deleteLabel={event?.title} />
    </form>
  );
}
