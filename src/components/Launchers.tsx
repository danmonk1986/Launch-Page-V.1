import { useState } from 'react';
import { Sheet } from './Sheet';
import {
  describeSchedule,
  happensOn,
  isoDate,
  orderLaunches,
  type HandledHow,
  normalizeUrl,
  openTabs,
  type Launch,
  type Launcher,
  type Repeat,
  type TileColor
} from '../lib/launchers';
import { formatMinutes, toMinutes } from '../lib/routines';

type Props = {
  routineName: string | null;
  launchers: Launcher[];
  launches: Launch[];
  onSaveLauncher: (l: Launcher) => Promise<void>;
  onDeleteLauncher: (id: string) => Promise<void>;
  onSaveLaunch: (l: Launch) => Promise<void>;
  onDeleteLaunch: (id: string) => Promise<void>;
  onStatus: (msg: string) => void;
  handled: Record<string, HandledHow | true>;
  today: Date;
  onFinish: (l: Launch, how: 'done' | 'skipped') => void;
};

const COLORS: TileColor[] = ['teal', 'purple', 'green'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type TimedView = 'active' | 'complete' | 'tomorrow' | 'all';

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
  const views: Record<TimedView, Launch[]> = {
    active: ordered.filter((l) => l.active && happensOn(l, p.today) && (!stateOf(l) || stateOf(l) === 'launched')),
    complete: ordered.filter((l) => happensOn(l, p.today) && (stateOf(l) === 'done' || stateOf(l) === 'skipped')),
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
          {p.routineName && <p className="panel-sub">For {p.routineName}</p>}
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-quiet" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setTile(null);
              setTileOpen(true);
            }}
          >
            + Add launch
          </button>
          <button type="button" className="btn" onClick={launchAll}>
            Launch all
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
          <h3 className="timed-title">Timed launches</h3>
          <button
            type="button"
            className="link-btn link-btn-inline"
            onClick={() => {
              setTimed(null);
              setTimedOpen(true);
            }}
          >
            + Add timed launch
          </button>
        </div>
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
                      {describeSchedule(l)} · {l.minutes} min · {l.urls.length} {l.urls.length === 1 ? 'tab' : 'tabs'}
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
          onCancel={() => setTileOpen(false)}
          onSave={async (l) => {
            await p.onSaveLauncher(l);
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

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<void> }) {
  return (
    <button type="button" className="btn btn-quiet btn-danger" aria-label={`Delete ${label}`} onClick={() => onDelete()}>
      Delete
    </button>
  );
}

function TileForm({
  tile,
  nextSort,
  onCancel,
  onSave,
  onDelete
}: {
  tile: Launcher | null;
  nextSort: number;
  onCancel: () => void;
  onSave: (l: Launcher) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Launcher>(
    () => tile ?? { id: crypto.randomUUID(), name: '', note: '', url: '', color: 'teal', routineIds: null, sort: nextSort }
  );
  const set = <K extends keyof Launcher>(k: K, v: Launcher[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        await onSave({ ...d, name: d.name.trim(), note: d.note.trim(), url: isBarePrefix(d.url) ? '' : d.url.trim() });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input required value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Online banking" />
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
        <span>Note under the name</span>
        <input value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="Bills" />
      </label>
      <fieldset className="field">
        <legend>Colour</legend>
        <div className="choice-row">
          {COLORS.map((c) => (
            <label key={c} className="choice">
              <input type="radio" name="tile-color" checked={d.color === c} onChange={() => set('color', c)} />
              <span className={`swatch-dot tile-${c}`} aria-hidden="true" />
              <span>{c === 'teal' ? 'Teal' : c === 'purple' ? 'Purple' : 'Green'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sheet-actions sheet-actions-split">
        {tile ? <DeleteButton label={tile.name} onDelete={() => onDelete(tile.id)} /> : <span />}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!d.name.trim()}>
            Save launch
          </button>
        </div>
      </div>
    </form>
  );
}

function TimedForm({
  launch,
  launchers,
  nextSort,
  onCancel,
  onSave,
  onDelete
}: {
  launch: Launch | null;
  launchers: Launcher[];
  nextSort: number;
  onCancel: () => void;
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
        sort: nextSort
      }
  );
  const [extra, setExtra] = useState(() =>
    (launch?.urls ?? []).filter((u) => !launchers.some((l) => l.url && l.url === u)).join('\n')
  );
  const set = <K extends keyof Launch>(k: K, v: Launch[K]) => setD((x) => ({ ...x, [k]: v }));
  const picked = new Set(d.urls);
  const toggleUrl = (url: string) =>
    set('urls', picked.has(url) ? d.urls.filter((u) => u !== url) : [...d.urls, url]);
  const toggleDay = (i: number) =>
    set('weekdays', d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort());

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const tileUrls = d.urls.filter((u) => launchers.some((l) => l.url === u));
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
            min={5}
            max={480}
            step={5}
            value={d.minutes}
            onChange={(e) => set('minutes', Math.max(5, Number(e.target.value) || 30))}
          />
        </label>
      </div>

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
      <label className="field">
        <span>Other links, one per line</span>
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

      <div className="sheet-actions sheet-actions-split">
        {launch ? <DeleteButton label={launch.title} onDelete={() => onDelete(launch.id)} /> : <span />}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!d.title.trim()}>
            Save timed launch
          </button>
        </div>
      </div>
    </form>
  );
}
