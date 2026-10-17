import { useState, useId } from 'react';
import { FormActions, Sheet } from './Sheet';
import {
  describeSchedule,
  LAUNCHER_PRESETS,
  happensOn,
  isoDate,
  orderLaunches,
  type HandledHow,
  normalizeUrl,
  APP_LINKS,
  describeOpens,
  openTabs,
  type Launch,
  type Launcher,
  type Repeat,
  type TileColor
} from '../lib/launchers';
import { formatMinutes, toMinutes } from '../lib/routines';
import { askNotificationPermission, chime, notificationsSupported } from '../lib/alerts';

type Props = {
  routineName: string | null;
  /** New tiles belong to this routine only. */
  routineId: string | null;
  launchers: Launcher[];
  launches: Launch[];
  onSaveLauncher: (l: Launcher) => Promise<void>;
  /** Saves a reordered set of tiles in one go. */
  onSaveLaunchers: (l: Launcher[]) => Promise<void>;
  onDeleteLauncher: (id: string) => Promise<void>;
  onSaveLaunch: (l: Launch) => Promise<void>;
  onDeleteLaunch: (id: string) => Promise<void>;
  onStatus: (msg: string) => void;
  handled: Record<string, HandledHow | true>;
  today: Date;
  onFinish: (l: Launch, how: 'done' | 'skipped') => void;
};

/** What fits on one line of a fixed-width tile. */
const NAME_MAX = 14;
const NOTE_MAX = 20;

const COLORS: TileColor[] = ['teal', 'purple', 'green', 'pink'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type TimedView = 'active' | 'complete' | 'tomorrow' | 'all';

const CLEARED_KEY = 'launchpage.launches.cleared.v1';

const TIMED_VIEWS: [TimedView, string][] = [
  ['active', 'Active'],
  ['complete', 'Complete'],
  ['tomorrow', 'Tomorrow'],
  ['all', 'All']
];

const EMPTY: Record<TimedView, string> = {
  active: 'Nothing left to launch today.',
  complete: 'Nothing checked off or skipped yet today.',
  tomorrow: 'Nothing scheduled for tomorrow.',
  all: 'No timed launches yet.'
};

/** Typing a link starts from https://www. so you only add the rest. */
const PREFIX = 'https://www.';
const withPrefix = (v: string) => (v.trim() ? v : PREFIX);
const isBarePrefix = (v: string) => /^https?:\/\/(www\.)?$/i.test(v.trim());

export const BLOCKED_HELP =
  'Your browser blocked some tabs. Allow pop-ups for this site, then launch again.';

export function LaunchersPanel(p: Props) {
  const [editing, setEditing] = useState(false);
  const [tile, setTile] = useState<Launcher | null>(null);
  const [tileOpen, setTileOpen] = useState(false);
  const [timed, setTimed] = useState<Launch | null>(null);
  const [timedOpen, setTimedOpen] = useState(false);
  const [launched, setLaunched] = useState<{ count: number; blocked: number } | null>(null);
  const [showAllTimed, setShowAllTimed] = useState(false);
  const [view, setView] = useState<TimedView>('active');
  const ordered = orderLaunches(p.launches, p.today, p.handled);
  const tomorrow = new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate() + 1, 12);
  const stateOf = (l: Launch) => {
    const h = p.handled[`${l.id}:${isoDate(p.today)}`];
    return h === true ? 'done' : h;
  };
  // Rows cleared from today's Complete list (this device). The launch itself stays.
  const [cleared, setCleared] = useState<Record<string, true>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLEARED_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const clearKey = (l: Launch) => `${l.id}:${isoDate(p.today)}`;
  function clearFromComplete(l: Launch) {
    const next = { ...cleared, [clearKey(l)]: true as const };
    setCleared(next);
    try {
      localStorage.setItem(CLEARED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const views: Record<TimedView, Launch[]> = {
    active: ordered.filter((l) => l.active && happensOn(l, p.today) && (!stateOf(l) || stateOf(l) === 'launched')),
    complete: ordered.filter(
      (l) => happensOn(l, p.today) && (stateOf(l) === 'done' || stateOf(l) === 'skipped') && !cleared[clearKey(l)]
    ),
    tomorrow: [...p.launches]
      .filter((l) => l.active && happensOn(l, tomorrow))
      .sort((a, b) => a.atTime.localeCompare(b.atTime)),
    all: [...p.launches].sort((a, b) => a.atTime.localeCompare(b.atTime))
  };
  const list = views[view];
  const visible = showAllTimed ? list : list.slice(0, 3);

  function launchAll() {
    const urls = p.launchers.map((l) => l.url).filter(Boolean);
    if (!urls.length) return p.onStatus('Add links to your tiles first.');
    const blocked = openTabs(urls);
    setLaunched({ count: urls.length, blocked });
    p.onStatus(blocked ? BLOCKED_HELP : `Launched ${urls.length} tabs.`);
  }

  return (
    <section className="panel panel-launchers" aria-labelledby="h-launchers">
      <div className="panel-head">
        <div>
          <h2 id="h-launchers" className="panel-title">
            Launchers
          </h2>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-pressed={editing}
            aria-label={editing ? 'Done editing launchers' : 'Edit launchers'}
            title={editing ? 'Done' : 'Edit'}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Icon d="M5 12l5 5L20 7" /> : <Icon d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />}
          </button>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add a launcher"
            title="Add"
            onClick={() => {
              setTile(null);
              setTileOpen(true);
            }}
          >
            <Icon d="M12 5v14M5 12h14" />
          </button>
          <button type="button" className="icon-btn tool-btn tool-btn-go" aria-label="Launch all" title="Launch all" onClick={launchAll}>
            <Icon d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </button>
        </div>
      </div>

      {launched && (
        <div className="launch-help" role="status">
          <p>
            {launched.blocked
              ? `Your browser blocked ${launched.blocked} of ${launched.count} tabs.`
              : `Sent ${launched.count} tabs. Only one opened? Your browser is blocking the rest as pop-ups.`}{' '}
            Allow pop-ups for this site once, then launch again:
          </p>
          <ul>
            <li>
              <strong>Firefox:</strong> Options in the yellow bar at the top → Allow pop-ups for this site.
            </li>
            <li>
              <strong>Chrome:</strong> the blocked pop-up icon at the right of the address bar → Always allow.
            </li>
            <li>
              <strong>Safari (iPad):</strong> Settings → Apps → Safari → turn off Block Pop-ups.
            </li>
          </ul>
          <button type="button" className="link-btn link-btn-inline" onClick={() => setLaunched(null)}>
            All tabs opened, hide this
          </button>
        </div>
      )}

      <ul className="tiles">
        {p.launchers.map((l) => (
          <li key={l.id}>
            {editing || !l.url ? (
              <button
                type="button"
                className="tile tile-edit"
                onClick={() => {
                  setTile(l);
                  setTileOpen(true);
                }}
              >
                <span className={`tile-badge tile-${l.color}`} aria-hidden="true">
                  {l.name.charAt(0)}
                </span>
                <span className="tile-words">
                  <span className="tile-name">{l.name}</span>
                  <span className="tile-note">{l.url ? 'Edit' : 'Add a link'}</span>
                </span>
              </button>
            ) : (
              <a className="tile" href={normalizeUrl(l.url)} target="_blank" rel="noopener noreferrer">
                <span className={`tile-badge tile-${l.color}`} aria-hidden="true">
                  {l.name.charAt(0)}
                </span>
                <span className="tile-words">
                  <span className="tile-name">{l.name}</span>
                  <span className="tile-note">{l.note}</span>
                </span>
              </a>
            )}
          </li>
        ))}
      </ul>

      <div className="timed">
        <div className="timed-head">
          <div className="timed-title-row">
            <h3 className="timed-title">Timed launches</h3>
            <div className="timed-tabs" role="tablist" aria-label="Timed launches">
              {TIMED_VIEWS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className="timed-tab"
                  onClick={() => {
                    setView(id);
                    setShowAllTimed(false);
                  }}
                >
                  {label}
                  <span className="timed-tab-count">{views[id].length}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add a timed launch"
            title="Add timed launch"
            onClick={() => {
              setTimed(null);
              setTimedOpen(true);
            }}
          >
            <Icon d="M12 5v14M5 12h14" />
          </button>
        </div>
        {list.length === 0 ? (
          <p className="panel-empty timed-empty">{p.launches.length === 0 ? 'At a set time, a reminder pops up and one tap opens every tab you need.' : EMPTY[view]}</p>
        ) : (
          <ul className="timed-list">
            {visible.map((l) => {
              // Tomorrow shows plain rows: today's check-offs belong to today.
              const ahead = view === 'tomorrow';
              const todays = !ahead && l.active && happensOn(l, p.today);
              const how = ahead ? undefined : stateOf(l);
              return (
                <li key={l.id} className={`timed-item${how && how !== 'launched' ? ` is-${how}` : ''}${how === 'launched' ? ' is-launched' : ''}`}>
                  <button
                    type="button"
                    className="timed-row"
                    onClick={() => {
                      setTimed(l);
                      setTimedOpen(true);
                    }}
                  >
                    <span className="timed-time">{formatMinutes(toMinutes(l.atTime))}</span>
                    <span className="timed-name">{l.title}</span>
                    <span className="timed-meta">
                      {describeSchedule(l)} · {l.minutes} min · {describeOpens(l.urls)}
                      {l.sound && ' · 🔊'}
                      {l.notify && ' · 🔔'}
                      {!l.active && ' · off'}
                      {how === 'launched' && ' · launched, check it off when done'}
                      {how === 'done' && ' · done today'}
                      {how === 'skipped' && ' · skipped, back tomorrow'}
                    </span>
                  </button>
                  {todays && (!how || how === 'launched') && (
                    <div className="timed-quick">
                      <button
                        type="button"
                        className="quick-btn quick-done"
                        aria-label={`Check off ${l.title} for today`}
                        title="Done today"
                        onClick={() => p.onFinish(l, 'done')}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="quick-btn quick-skip"
                        aria-label={`Skip ${l.title} today`}
                        title="Skip today"
                        onClick={() => p.onFinish(l, 'skipped')}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {view === 'complete' && (
                    <div className="timed-quick">
                      <button
                        type="button"
                        className="quick-btn quick-skip"
                        aria-label={`Clear ${l.title} from Complete`}
                        title="Clear from Complete"
                        onClick={() => clearFromComplete(l)}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {list.length > 3 && (
          <button
            type="button"
            className="timed-more"
            aria-expanded={showAllTimed}
            onClick={() => setShowAllTimed((v) => !v)}
          >
            {showAllTimed ? 'Show 3' : `Show all ${list.length}`}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={showAllTimed ? 'is-open' : ''}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      <Sheet open={tileOpen} title={tile ? `Edit ${tile.name}` : 'Add launch'} onClose={() => setTileOpen(false)}>
        <TileForm
          tile={tile}
          nextSort={p.launchers.length}
          routineId={p.routineId}
          taken={p.launchers.map((l) => l.name)}
          tiles={p.launchers}
          onCancel={() => setTileOpen(false)}
          onSave={async (l, position) => {
            const others = p.launchers.filter((x) => x.id !== l.id);
            const from = p.launchers.findIndex((x) => x.id === l.id);
            if (position === null || position === from) {
              await p.onSaveLauncher(l);
            } else {
              others.splice(position, 0, l);
              await p.onSaveLaunchers(
                others.map((x, i) => ({ ...x, sort: i })).filter((x) => x.id === l.id || p.launchers.find((o) => o.id === x.id)?.sort !== x.sort)
              );
            }
            setTileOpen(false);
          }}
          onDelete={async (id) => {
            await p.onDeleteLauncher(id);
            setTileOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={timedOpen} title={timed ? `Edit ${timed.title}` : 'Add timed launch'} onClose={() => setTimedOpen(false)} wide>
        <TimedForm
          launch={timed}
          launchers={p.launchers}
          nextSort={p.launches.length}
          onCancel={() => setTimedOpen(false)}
          onSave={async (l) => {
            await p.onSaveLaunch(l);
            setTimedOpen(false);
          }}
          onDelete={async (id) => {
            await p.onDeleteLaunch(id);
            setTimedOpen(false);
          }}
        />
      </Sheet>
    </section>
  );
}


function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const SOUND_ICON = 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6';
const BELL_ICON = 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4';


function TileForm({
  tile,
  nextSort,
  routineId,
  taken,
  tiles,
  onSave,
  onDelete
}: {
  tile: Launcher | null;
  nextSort: number;
  routineId: string | null;
  taken: string[];
  tiles: Launcher[];
  onCancel?: () => void;
  /** position: the new place in the routine's tiles (0 = first), or null to leave it. */
  onSave: (l: Launcher, position: number | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Launcher>(
    () =>
      tile ?? {
        id: crypto.randomUUID(),
        name: '',
        note: '',
        url: '',
        color: 'teal',
        routineIds: routineId ? [routineId] : null,
        sort: nextSort
      }
  );
  const open = LAUNCHER_PRESETS.filter((p) => !taken.includes(p.name));
  const from = tile ? tiles.findIndex((t) => t.id === tile.id) : -1;
  const [position, setPosition] = useState(from);
  const set = <K extends keyof Launcher>(k: K, v: Launcher[K]) => setD((x) => ({ ...x, [k]: v }));

  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        await onSave({ ...d, name: d.name.trim(), note: d.note.trim(), url: isBarePrefix(d.url) ? '' : d.url.trim() }, tile ? position : null);
      }}
    >
      <label className="field">
        <span>
          Name <span className="char-count">{d.name.length}/{NAME_MAX}</span>
        </span>
        <input
          required
          maxLength={NAME_MAX}
          list={open.length ? 'launcher-originals' : undefined}
          autoComplete="off"
          value={d.name}
          onChange={(e) => {
            const name = e.target.value;
            const p = open.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
            setD((x) => (p ? { ...x, name: p.name, note: p.note, url: p.url, color: p.color } : { ...x, name }));
          }}
          placeholder={!open.length ? 'Online bank' : 'New, or pick an original'}
        />
        {open.length > 0 && (
          <datalist id="launcher-originals">
            {open.map((p) => (
              <option key={p.name} value={p.name}>
                {p.note}
              </option>
            ))}
          </datalist>
        )}
      </label>
      <label className="field">
        <span>Link</span>
        <input
          type="url"
          inputMode="url"
          value={d.url}
          onFocus={() => set('url', withPrefix(d.url))}
          onBlur={() => isBarePrefix(d.url) && set('url', '')}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://www.example.com"
        />
      </label>
      <label className="field">
        <span>
          Note under the name <span className="char-count">{d.note.length}/{NOTE_MAX}</span>
        </span>
        <input maxLength={NOTE_MAX} value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="Bills" />
      </label>
      {tile && tiles.length > 1 && (
        <label className="field">
          <span>Position</span>
          <select value={position} onChange={(e) => setPosition(Number(e.target.value))}>
            {tiles.map((t, i) => (
              <option key={t.id} value={i}>
                {i + 1}
                {i === from ? ' (here now)' : ` · where ${t.name} is`}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="field">
        <legend>Colour</legend>
        <div className="choice-row">
          {COLORS.map((c) => (
            <label key={c} className="choice">
              <input type="radio" name="tile-color" checked={d.color === c} onChange={() => set('color', c)} />
              <span className={`swatch-dot tile-${c}`} aria-hidden="true" />
              <span>{c === 'teal' ? 'Teal' : c === 'purple' ? 'Purple' : c === 'green' ? 'Green' : 'Pink'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormActions formId={formId} saveDisabled={!d.name.trim()} onDelete={tile ? () => onDelete(tile.id) : undefined} deleteLabel={tile?.name} />
    </form>
  );
}

function TimedForm({
  launch,
  launchers,
  nextSort,
  onSave,
  onDelete
}: {
  launch: Launch | null;
  launchers: Launcher[];
  nextSort: number;
  onCancel?: () => void;
  onSave: (l: Launch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Launch>(
    () =>
      launch ?? {
        id: crypto.randomUUID(),
        title: '',
        atTime: '10:00',
        repeat: 'weekly',
        weekdays: [1, 2, 3, 4, 5],
        monthDay: 1,
        onDate: null,
        minutes: 30,
        urls: [],
        active: true,
        movedTo: null,
        sound: true,
        notify: false,
        sort: nextSort
      }
  );
  const [extra, setExtra] = useState(() =>
    (launch?.urls ?? [])
      .filter((u) => !launchers.some((l) => l.url && l.url === u) && !APP_LINKS.some((a) => a.url === u))
      .join('\n')
  );
  const set = <K extends keyof Launch>(k: K, v: Launch[K]) => setD((x) => ({ ...x, [k]: v }));
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const picked = new Set(d.urls);
  const toggleUrl = (url: string) =>
    set('urls', picked.has(url) ? d.urls.filter((u) => u !== url) : [...d.urls, url]);
  const toggleDay = (i: number) =>
    set('weekdays', d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort());

  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const tileUrls = d.urls.filter((u) => launchers.some((l) => l.url === u) || APP_LINKS.some((a) => a.url === u));
        const extras = extra
          .split(/\s+/)
          .map((u) => u.trim())
          .filter((u) => u && !isBarePrefix(u));
        await onSave({ ...d, title: d.title.trim(), urls: [...tileUrls, ...extras] });
      }}
    >
      <label className="field">
        <span>What</span>
        <input required value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Pay bills" />
      </label>

      <div className="time-grid">
        <label className="field">
          <span>Time</span>
          <input type="time" required value={d.atTime} onChange={(e) => set('atTime', e.target.value || '10:00')} />
        </label>
        <label className="field">
          <span>Time allotted (minutes)</span>
          <input
            type="number"
            min={1}
            max={480}
            step={1}
            value={d.minutes}
            onChange={(e) => set('minutes', Math.min(480, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      </div>

      <fieldset className="field">
        <legend>Alerts for this launch</legend>
        <div className="choice-row">
          <button
            type="button"
            className="alert-chip"
            aria-pressed={d.sound}
            onClick={() => {
              if (!d.sound) chime('start');
              set('sound', !d.sound);
            }}
          >
            <Icon d={d.sound ? SOUND_ICON : 'M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6'} />
            <span>{d.sound ? 'Alarm on' : 'Alarm off'}</span>
          </button>
          {notificationsSupported() && (
            <button
              type="button"
              className="alert-chip"
              aria-pressed={d.notify}
              onClick={async () => {
                if (d.notify) return set('notify', false);
                const ok = await askNotificationPermission();
                setNotifyBlocked(!ok);
                if (ok) set('notify', true);
              }}
            >
              <Icon d={d.notify ? BELL_ICON : BELL_ICON + 'M3 3l18 18'} />
              <span>{d.notify ? 'Notification on' : 'Notification off'}</span>
            </button>
          )}
        </div>
        <p className="field-hint">
          {notifyBlocked
            ? 'Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.'
            : 'The alarm chimes at the start and when the time allotted runs out.'}
        </p>
      </fieldset>

      <fieldset className="field">
        <legend>Repeats</legend>
        <div className="choice-row">
          {(['weekly', 'monthly', 'once'] as Repeat[]).map((r) => (
            <label key={r} className="choice">
              <input type="radio" name="repeat" checked={d.repeat === r} onChange={() => set('repeat', r)} />
              <span>{r === 'weekly' ? 'Weekly' : r === 'monthly' ? 'Monthly' : 'Once'}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {d.repeat === 'weekly' && (
        <fieldset className="field">
          <legend>On</legend>
          <div className="day-row">
            {DAYS.map((label, i) => (
              <label key={i} className={`day-pill${d.weekdays.includes(i) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={d.weekdays.includes(i)} onChange={() => toggleDay(i)} aria-label={DAY_NAMES[i]} />
                <span aria-hidden="true">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {d.repeat === 'monthly' && (
        <label className="field">
          <span>Day of the month</span>
          <input
            type="number"
            min={1}
            max={31}
            value={d.monthDay ?? 1}
            onChange={(e) => set('monthDay', Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      )}
      {d.repeat === 'once' && (
        <label className="field">
          <span>Date</span>
          <input type="date" value={d.onDate ?? ''} onChange={(e) => set('onDate', e.target.value || null)} />
        </label>
      )}

      <fieldset className="field">
        <legend>Tabs to open</legend>
        <div className="tab-picks">
          {launchers
            .filter((l) => l.url)
            .map((l) => (
              <label key={l.id} className="choice">
                <input type="checkbox" checked={picked.has(l.url)} onChange={() => toggleUrl(l.url)} />
                <span>{l.name}</span>
              </label>
            ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Apps to open</legend>
        <div className="tab-picks">
          {APP_LINKS.map((a) => (
            <label key={a.url} className="choice">
              <input type="checkbox" checked={picked.has(a.url)} onChange={() => toggleUrl(a.url)} />
              <span>{a.name}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">The first time, your browser asks to open the app. Tick “Always allow” and it opens straight away after that. Other apps: paste their link (like <code>todoist://</code>) below.</p>
      </fieldset>
      <label className="field">
        <span>Other links or app links, one per line</span>
        <textarea
          rows={3}
          value={extra}
          onFocus={() => setExtra((v) => (v.trim() ? (v.endsWith('\n') ? v + PREFIX : v) : PREFIX))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setExtra((v) => `${v}\n${PREFIX}`);
            }
          }}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="https://www.atb.com"
        />
      </label>

      <label className="choice choice-wide">
        <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} />
        <span>On: remind me at this time</span>
      </label>

      <FormActions formId={formId} saveDisabled={!d.title.trim()} onDelete={launch ? () => onDelete(launch.id) : undefined} deleteLabel={launch?.title} />
    </form>
  );
}

