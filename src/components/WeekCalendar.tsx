import { useCallback, useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { addDays, layoutWeek, weekStart, type CalEvent, type EventColor } from '../lib/events';
import { isoDate } from '../lib/launchers';
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

type Props = {
  events: CalEvent[];
  onSave: (e: CalEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStatus?: (msg: string) => void;
};

const COLORS: EventColor[] = ['teal', 'purple', 'blue'];

type GState = 'off' | 'reconnect' | 'loading' | 'on';

/** Sunday to Saturday. Multi-day events span their days; click a day to add, an event to edit. */
export function WeekCalendar({ events, onSave, onDelete, onStatus }: Props) {
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

  const refresh = useCallback(async () => {
    if (!hasToken()) {
      setG(wasConnected() ? 'reconnect' : 'off');
      return;
    }
    setG('loading');
    try {
      setGEvents(await listGoogleEvents(from, to));
      setGError(null);
      setG('on');
    } catch (err) {
      if (err instanceof GoogleAuthError) setG('reconnect');
      else {
        setGError((err as Error).message);
        setG('on');
      }
    }
  }, [from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Pick up changes made in Google while LaunchPage stays open.
  useEffect(() => {
    if (g !== 'on') return;
    const t = window.setInterval(refresh, 5 * 60_000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [g, refresh]);

  async function connect() {
    try {
      await connectGoogle();
      onStatus?.('Google Calendar connected.');
      await refresh();
    } catch (err) {
      onStatus?.((err as Error).message);
    }
  }

  async function disconnect() {
    await disconnectGoogle();
    setGEvents([]);
    setG('off');
    onStatus?.('Google Calendar disconnected.');
  }

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
  const placed = layoutWeek(all, start);
  const lanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  const end = days[6];
  const range = `${start.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', {
    month: start.getMonth() === end.getMonth() ? undefined : 'long',
    day: 'numeric'
  })}`;

  return (
    <section className="panel panel-week" aria-labelledby="h-week">
      <div className="panel-head">
        <div>
          <h2 id="h-week" className="panel-title">
            {offset === 0 ? 'This week' : 'Week of'}
          </h2>
          <p className="panel-sub">
            {range}
            {g === 'on' && (
              <>
                {' · '}Google Calendar{' '}
                <button type="button" className="link-btn link-btn-inline link-quiet" onClick={disconnect}>
                  Disconnect
                </button>
              </>
            )}
          </p>
        </div>
        <div className="panel-actions">
          {g === 'off' && googleConfigured() && (
            <button type="button" className="btn btn-quiet" onClick={connect}>
              Connect Google
            </button>
          )}
          {g === 'reconnect' && (
            <button type="button" className="btn btn-quiet" onClick={connect} title="Google's pass lasts an hour. One click renews it.">
              Reconnect Google
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </button>
          {offset !== 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setOffset(0)}>
              Today
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
            ›
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setEditing(null);
              setNewDate(offset === 0 ? today : from);
              setOpen(true);
            }}
          >
            + Add event
          </button>
        </div>
      </div>

      {gError && <p className="panel-empty">{gError}</p>}

      <div className="week-scroll">
        <div className="week-grid" style={{ gridTemplateRows: `auto repeat(${Math.max(lanes, 1)}, 32px)` }}>
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
                <span className="week-dow">{d.toLocaleDateString('en-CA', { weekday: 'short' })}</span>
                <span className="week-num">{d.getDate()}</span>
              </button>
            );
          })}
          {placed.map(({ event, lane, from: f, to: t }) => (
            <button
              key={event.id}
              type="button"
              className={`week-event ev-${event.google ? 'google' : event.color}`}
              style={{ gridColumn: `${f} / ${t + 1}`, gridRow: lane + 2 }}
              title={event.google ? 'From Google Calendar' : undefined}
              onClick={() => {
                setEditing(event);
                setOpen(true);
              }}
            >
              {event.google?.time && <span className="ev-time">{event.google.time}</span>}
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
                setGEvents((list) => list.map((x) => (x.id === saved.id ? saved : x)));
                onStatus?.(`${saved.title} updated in Google Calendar.`);
              } else if (toGoogle) {
                const saved = await withGoogle(() => createGoogleEvent(e));
                setGEvents((list) => [...list, saved]);
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
                setGEvents((list) => list.filter((x) => x.id !== ev.id));
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

function EventForm({
  event,
  date,
  googleOn,
  onCancel,
  onSave,
  onDelete
}: {
  event: CalEvent | null;
  date: string;
  googleOn: boolean;
  onCancel: () => void;
  onSave: (e: CalEvent, toGoogle: boolean) => Promise<void>;
  onDelete: (e: CalEvent) => Promise<void>;
}) {
  const [d, setD] = useState<CalEvent>(
    () => event ?? { id: crypto.randomUUID(), title: '', startDate: date, endDate: date, color: 'teal', sort: 0 }
  );
  const [toGoogle, setToGoogle] = useState(googleOn);
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setD((x) => ({ ...x, [k]: v }));
  const isGoogle = !!d.google;
  const timed = !!d.google?.time;
  const google = isGoogle || (!event && toGoogle);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const endDate = d.endDate < d.startDate ? d.startDate : d.endDate;
        await onSave({ ...d, title: d.title.trim(), endDate }, !event && toGoogle);
      }}
    >
      <label className="field">
        <span>Event</span>
        <input required value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Pay mid-month bills" />
      </label>
      {timed ? (
        <p className="field-hint event-when">
          {new Date(`${d.startDate}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} at {d.google!.time}.
          Change the time in Google Calendar.
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
      <div className="sheet-actions sheet-actions-split">
        {event ? (
          <button type="button" className="btn btn-quiet btn-danger" aria-label={`Delete ${event.title}`} onClick={() => onDelete(event)}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!d.title.trim()}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
