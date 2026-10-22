import { useEffect, useState, useId, useRef } from 'react';
import { FormActions, Sheet } from './Sheet';
import {
  describeSchedule,
  LAUNCHER_PRESETS,
  happensToday,
  launchDate,
  isoDate,
  orderLaunches,
  type HandledHow,
  normalizeUrl,
  APP_LINKS,
  CARD_LINKS,
  openCard,
  describeOpens,
  nextDate,
  timeFor,
  type LaunchLog,
  openTabs,
  type Launch,
  type Launcher,
  type Repeat,
  type TileColor,
  runKey,
  opensSomething,
  describeLog,
  LOG_KINDS,
  type LaunchLogKind
} from '../lib/launchers';
import { formatMinutes, toMinutes } from '../lib/routines';
import { chime, isTone, TONES } from '../lib/alerts';

/** What "+ Timed launch" hands over: the fields to fill in, and who to tell once it's saved. */
export type TimedPreset = { fill: Partial<Launch>; n: number; onSaved?: (l: Launch) => void };

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
  /** Opens a timed launch's tabs and apps now, without waiting for its time. */
  onLaunchNow: (l: Launch) => void;
  /** Opens Add timed launch filled in (from a routine step or a task) to check before saving. */
  preset?: TimedPreset | null;
  /** Runs of each launch: today's +10 minutes show on the row. */
  log?: LaunchLog[];
  onPresetUsed?: () => void;
  /** Rituals a timed launch can open (26 Days). */
  rituals?: { id: string; name: string }[];
};

/** What fits on one line of a fixed-width tile. */
const NAME_MAX = 14;
const NOTE_MAX = 20;

const COLORS: TileColor[] = ['teal', 'purple', 'green', 'pink'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type TimedView = 'active' | 'complete' | 'tomorrow' | 'scheduled' | 'all' | 'history';

const CLEARED_KEY = 'launchpage.launches.cleared.v1';

const TIMED_VIEWS: [TimedView, string][] = [
  ['active', 'Active'],
  ['complete', 'Complete'],
  ['tomorrow', 'Tomorrow'],
  ['scheduled', 'Scheduled'],
  ['all', 'All'],
  ['history', 'History']
];

const EMPTY: Record<TimedView, string> = {
  active: 'Nothing left to launch today.',
  complete: 'Nothing checked off or skipped yet today.',
  tomorrow: 'Nothing scheduled for tomorrow.',
  scheduled: 'Nothing switched on and ahead.',
  all: 'No timed launches yet.',
  history: 'No runs logged yet.'
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
  const [fill, setFill] = useState<TimedPreset | null>(null);
  useEffect(() => {
    if (!p.preset) return;
    setTimed(null);
    setFill(p.preset);
    setTimedOpen(true);
    p.onPresetUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.preset]);
  const [launched, setLaunched] = useState<{ count: number; blocked: number } | null>(null);
  // The rocket tiles start hidden; ⌄ beside the title shows them (remembered on this device).
  const [showTiles, setShowTiles] = useState(() => {
    try {
      return localStorage.getItem('launchpage.rockets.open') === '1';
    } catch {
      return false;
    }
  });
  const toggleTiles = (on: boolean) => {
    setShowTiles(on);
    try {
      localStorage.setItem('launchpage.rockets.open', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  const [showAllTimed, setShowAllTimed] = useState(false);
  const [view, setView] = useState<TimedView>('active');
  // The X on a row asks first: skip just today, or remove the launch for good.
  const [xAsk, setXAsk] = useState<string | null>(null);
  const ordered = orderLaunches(p.launches, p.today, p.handled);
  // The next routine day: 24 hours on from now (the day rolls over at the routine's reset, not midnight).
  const tomorrow = new Date(p.today.getTime() + 86_400_000);
  const stateOf = (l: Launch) => {
    const h = p.handled[runKey(l, p.today)];
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
  const clearKey = (l: Launch) => runKey(l, p.today);
  function clearFromComplete(l: Launch) {
    const next = { ...cleared, [clearKey(l)]: true as const };
    setCleared(next);
    try {
      localStorage.setItem(CLEARED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const nextOf = (l: Launch) => nextDate(l, p.today);
  const views: Record<TimedView, Launch[]> = {
    active: ordered.filter((l) => l.active && happensToday(l, p.today) && (!stateOf(l) || stateOf(l) === 'launched')),
    complete: ordered.filter(
      (l) => happensToday(l, p.today) && (stateOf(l) === 'done' || stateOf(l) === 'skipped') && !cleared[clearKey(l)]
    ),
    tomorrow: [...p.launches]
      .filter((l) => l.active && happensToday(l, tomorrow))
      .sort((a, b) => a.atTime.localeCompare(b.atTime)),
    // Scheduled (Oct 22): every launch that's on and still ahead, once each (not once per day),
    // soonest first, so you can look forward without the daily ones repeating.
    scheduled: p.launches
      .filter((l) => l.active && nextOf(l))
      .sort((a, b) => (nextOf(a) ?? '').localeCompare(nextOf(b) ?? '') || a.atTime.localeCompare(b.atTime)),
    all: [...p.launches].sort((a, b) => a.atTime.localeCompare(b.atTime)),
    history: []
  };
  // History (Oct 22): every finished run, newest first.
  const history = (p.log ?? [])
    .filter((g) => g.outcome !== 'launched' || g.finishedAt)
    .sort((a, b) => (b.finishedAt ?? b.launchedAt ?? b.day).localeCompare(a.finishedAt ?? a.launchedAt ?? a.day));
  const countOf = (id: TimedView) => (id === 'history' ? history.length : views[id].length);
  const list = views[view];
  // Active keeps to the next 3 (Show all for the rest); the other tabs show their whole list.
  const capped = view === 'active' && !showAllTimed;
  const visible = capped ? list.slice(0, 3) : list;

  function launchAll() {
    const urls = p.launchers.filter((l) => !l.hidden).map((l) => l.url).filter(Boolean);
    if (!urls.length) return p.onStatus('Add links to your tiles first.');
    const blocked = openTabs(urls);
    setLaunched({ count: urls.length, blocked });
    p.onStatus(blocked ? BLOCKED_HELP : `Launched ${urls.length} tabs.`);
  }

  return (
    <section className={`panel panel-launchers${showTiles ? '' : ' tiles-hidden'}`} aria-labelledby="h-launchers">
      <div className="panel-head">
        <div className="rockets-title">
          <h2 id="h-launchers" className="panel-title">
            Rockets
          </h2>
          <button
            type="button"
            className={`rockets-toggle${showTiles ? ' is-open' : ''}`}
            aria-expanded={showTiles}
            aria-controls="rocket-tiles"
            aria-label={showTiles ? 'Hide the rockets' : 'Show the rockets'}
            title={showTiles ? 'Hide the rockets' : 'Show the rockets'}
            onClick={() => toggleTiles(!showTiles)}
          >
            <Icon d="M6 9l6 6 6-6" />
          </button>
        </div>
        <div className="panel-actions" hidden={!showTiles}>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-pressed={editing}
            aria-label={editing ? 'Done editing rockets' : 'Edit rockets'}
            title={editing ? 'Done' : 'Edit'}
            onClick={() => {
              if (!editing) toggleTiles(true);
              setEditing((e) => !e);
            }}
          >
            {editing ? <Icon d="M5 12l5 5L20 7" /> : <Icon d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />}
          </button>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add a rocket"
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

      <ul className="tiles" id="rocket-tiles" hidden={!showTiles}>
        {/* Hidden rockets stay off the Launch Page; in edit mode they show dimmed so you can bring them back. */}
        {p.launchers.filter((l) => !l.hidden).map((l) => (
          <li key={l.id}>
            {editing || !l.url ? (
              <button
                type="button"
                className={`tile tile-edit${l.hidden ? ' tile-hidden' : ''}`}
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
              <a
                className="tile"
                href={normalizeUrl(l.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Card rockets open a LaunchPage page here, not a new tab.
                  if (openCard(l.url)) e.preventDefault();
                }}
              >
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
                  <span className="timed-tab-count">{countOf(id)}</span>
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
              setFill(null);
              setTimedOpen(true);
            }}
          >
            <Icon d="M12 5v14M5 12h14" />
          </button>
        </div>
        {view === 'history' ? (
          history.length === 0 ? (
            <p className="panel-empty timed-empty">{EMPTY.history}</p>
          ) : (
            <ul className="timed-list">
              {history.slice(0, showAllTimed ? undefined : 30).map((g) => {
                const spent = g.launchedAt && g.finishedAt ? Math.round((new Date(g.finishedAt).getTime() - new Date(g.launchedAt).getTime()) / 60_000) : null;
                return (
                  <li key={g.id} className={`timed-item is-${g.outcome === 'skipped' ? 'skipped' : 'done'}`}>
                    <div className="timed-row">
                      <span className="timed-time">{new Date(`${g.day}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
                      <span className="timed-name">{g.title}</span>
                      <span className="timed-meta">
                        {g.outcome === 'skipped' ? 'Skipped' : 'Done'}
                        {g.outcome !== 'skipped' && ` · ${spent ?? g.planned + g.extra} min${spent === null ? ' planned' : ''}`}
                        {g.extra > 0 && ` · +${g.extra} added`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : list.length === 0 ? (
          <p className="panel-empty timed-empty">{p.launches.length === 0 ? 'At a set time, a reminder pops up and one tap opens every tab you need.' : EMPTY[view]}</p>
        ) : (
          <ul className="timed-list">
            {visible.map((l) => {
              // Tomorrow shows plain rows: today's check-offs belong to today.
              const ahead = view === 'tomorrow' || view === 'scheduled';
              const todays = !ahead && l.active && happensToday(l, p.today);
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
                    <span className="timed-time">{formatMinutes(toMinutes(ahead ? timeFor(l, tomorrow) : timeFor(l, p.today)))}</span>
                    <span className="timed-name">{l.title}</span>
                    <span className="timed-meta">
                      {view === 'scheduled' && nextOf(l) ? `Next ${new Date(`${nextOf(l)}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · ` : ''}
                      {describeSchedule(l)} · {l.minutes} min
                      {(() => {
                        const g = !ahead && p.log?.find((x) => x.launchId === l.id && x.day === isoDate(launchDate(l, p.today)));
                        return g && g.extra > 0 ? ` (+${g.extra} → ${g.planned + g.extra} min)` : '';
                      })()}{' '}
                      {opensSomething(l) ? ` · ${describeOpens(l.urls)}` : ''}
                      {l.logKind ? ` · logs ${describeLog(l)}` : ''}
                      {l.sound && ' · 🔊'}
                      {!l.active && ' · off'}
                      {how === 'launched' && ' · launched, check it off when done'}
                      {how === 'done' && ' · done today'}
                      {how === 'skipped' && (l.repeat === 'hourly' ? ' · skipped this hour' : ' · skipped, back tomorrow')}
                    </span>
                  </button>
                  {todays && (!how || how === 'launched') && xAsk === l.id && (
                    <div className="timed-quick timed-xask" role="group" aria-label={`Remove ${l.title}`}>
                      <button type="button" className="btn btn-quiet" onClick={() => { setXAsk(null); p.onFinish(l, 'skipped'); }}>
                        Skip
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={async () => {
                          setXAsk(null);
                          await p.onDeleteLaunch(l.id);
                          p.onStatus(`${l.title} removed.`);
                        }}
                      >
                        Remove
                      </button>
                      <button type="button" className="quick-btn" aria-label="Cancel" title="Cancel" onClick={() => setXAsk(null)}>
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {todays && (!how || how === 'launched') && xAsk !== l.id && (
                    <div className="timed-quick">
                      {opensSomething(l) ? (
                        <button type="button" className="quick-btn quick-launch" aria-label={`Launch ${l.title} now`} title="Launch now" onClick={() => p.onLaunchNow(l)}>
                          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                          </svg>
                        </button>
                      ) : null}
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
                        aria-label={`Skip or remove ${l.title}`}
                        title="Skip today or remove"
                        onClick={() => setXAsk(l.id)}
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
        {((view === 'active' && list.length > 3) || (view === 'history' && history.length > 30)) && (
          <button
            type="button"
            className="timed-more"
            aria-expanded={showAllTimed}
            onClick={() => setShowAllTimed((v) => !v)}
          >
            {view === 'history' ? (showAllTimed ? 'Show the latest 30' : `Show all ${history.length}`) : showAllTimed ? 'Show 3' : `Show all ${list.length}`}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={showAllTimed ? 'is-open' : ''}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      <Sheet open={tileOpen} title={tile ? `Edit ${tile.name}` : 'Add rocket'} onClose={() => setTileOpen(false)}>
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

      <Sheet
        open={timedOpen}
        title={timed ? `Edit ${timed.title}` : 'Add timed launch'}
        onClose={() => {
          setTimedOpen(false);
          setFill(null);
        }}
        wide
      >
        <TimedForm
          launch={timed}
          today={p.today}
          fill={timed ? null : fill?.fill ?? null}
          launchers={p.launchers}
          onAddRocket={async (url) => {
            await p.onSaveLauncher({ id: crypto.randomUUID(), name: nameFromUrl(url), note: '', url, color: 'teal', routineIds: p.routineId ? [p.routineId] : null, sort: p.launchers.length });
          }}
          rituals={p.rituals ?? []}
          titles={[...new Set(p.launches.map((l) => l.title.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))}
          nextSort={p.launches.length}
          onCancel={() => setTimedOpen(false)}
          onSave={async (l) => {
            await p.onSaveLaunch(l);
            if (!timed) fill?.onSaved?.(l);
            setFill(null);
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
        <NameCombo
          value={d.name}
          options={[
            // Hidden rockets come first: pick one to put it back on the Launch Page (Oct 22).
            ...(tile ? [] : tiles.filter((t) => t.hidden).map((t) => ({ name: t.name, note: t.note, url: t.url, color: t.color, kind: 'Hidden', id: t.id }))),
            ...open.map((p) => ({ name: p.name, note: p.note, url: p.url, color: p.color, kind: 'Original' })),
            ...APP_LINKS.filter((a) => !taken.includes(a.name)).map((a) => ({ name: a.name, note: 'App', url: a.url, color: 'purple' as TileColor, kind: 'App' })),
            ...CARD_LINKS.filter((c) => !taken.includes(c.name)).map((c) => ({ name: c.name, note: 'LaunchPage card', url: c.url, color: 'green' as TileColor, kind: 'Card' }))
          ]}
          onType={(name) => setD((x) => ({ ...x, name }))}
          onPick={(o) => {
            const back = o.id ? tiles.find((t) => t.id === o.id) : undefined;
            if (back) return setD({ ...back, hidden: false });
            setD((x) => ({ ...x, name: o.name, note: o.note, url: o.url, color: o.color }));
          }}
          placeholder="New, or pick from the list"
        />
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
      <label className="choice choice-wide">
        <input type="checkbox" checked={!!d.hidden} onChange={(e) => setD((x) => ({ ...x, hidden: e.target.checked }))} />
        <span>Hide from the Launch Page (keeps it for timed launches and rituals; bring it back from + Add rocket)</span>
      </label>
      <FormActions formId={formId} saveDisabled={!d.name.trim()} onDelete={tile ? () => onDelete(tile.id) : undefined} deleteLabel={tile?.name} />
    </form>
  );
}

/** The starting list for a timed launch's What; anything typed there joins it once saved. */
const WHAT_CATEGORIES = ['Work Block #1', 'Work Block #2', 'Work Block #3', 'Expansion Work', 'Leisure Work'];
function splitTitle(t: string) {
  const i = t.indexOf(' - ');
  return i < 0 ? { cat: t.trim(), desc: '' } : { cat: t.slice(0, i).trim(), desc: t.slice(i + 3).trim() };
}
const joinTitle = (c: string, x: string) => (x.trim() ? `${c.trim()} - ${x.trim()}` : c.trim());
/** The day after the latest date already picked, for + Add another date. */
function nextFree(l: Launch) {
  const all = [l.onDate, ...(l.moreDates ?? [])].filter((x): x is string => !!x).sort();
  const last = all.length ? new Date(`${all[all.length - 1]}T12:00:00`) : new Date();
  last.setDate(last.getDate() + 1);
  return isoDate(last);
}

function TimedForm({
  launch,
  today,
  fill,
  launchers,
  rituals,
  titles,
  nextSort,
  onSave,
  onDelete,
  onAddRocket
}: {
  launch: Launch | null;
  today: Date;
  fill?: Partial<Launch> | null;
  launchers: Launcher[];
  /** Add new rocket: saves a pasted link as a rocket tile. */
  onAddRocket: (url: string) => Promise<void>;
  rituals: { id: string; name: string }[];
  /** Names already used, so the same task keeps the same name. */
  titles: string[];
  nextSort: number;
  onCancel?: () => void;
  onSave: (l: Launch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [ask, setAsk] = useState<Launch | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  // Once: the date assumes today (when it's empty or already past).
  const todayIso = isoDate(today);
  const onceDate = (x: string | null) => (!x || x < todayIso ? todayIso : x);
  const [d, setD] = useState<Launch>(
    () =>
      (launch && launch.repeat === 'once' ? { ...launch, onDate: onceDate(launch.onDate) } : launch) ?? {
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
        // New launches log Productivity when checked off (change it under Logs when checked off).
        logKind: 'productivity',
        ...fill,
        sort: nextSort
      }
  );
  const set = <K extends keyof Launch>(k: K, v: Launch[K]) => setD((x) => ({ ...x, [k]: v }));
  // What = a category (Work Block #1…, or any you type, which joins the list once saved) and a
  // description. Saved as one title, "Category - Description", so lists read the same (Oct 20).
  const [cat, setCat] = useState(() => splitTitle(d.title).cat);
  const [desc, setDesc] = useState(() => splitTitle(d.title).desc);
  const setWhat = (c: string, x: string) => {
    setCat(c);
    setDesc(x);
    set('title', joinTitle(c, x));
  };
  const categories = [...new Set([...WHAT_CATEGORIES, ...titles.map((t) => splitTitle(t).cat).filter(Boolean)])];
  const descriptions = [...new Set(titles.map(splitTitle).filter((t) => t.cat === cat.trim() && t.desc).map((t) => t.desc))].sort((a, b) => a.localeCompare(b));
  const toggleDay = (i: number) =>
    set('weekdays', d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort());

  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const more = d.repeat === 'once' ? [...new Set((d.moreDates ?? []).filter((x) => x && x !== d.onDate))].sort() : [];
        const next = { ...d, active: true, notify: false, title: d.title.trim(), urls: d.urls.filter((u) => u && !isBarePrefix(u)), ...(d.moreDates !== undefined || more.length ? { moreDates: more } : {}) };
        // A repeating launch whose time changed: ask whether it's just the next one or every time.
        if (launch && launch.repeat !== 'once' && launch.repeat !== 'hourly' && d.atTime !== launch.atTime && !scope) {
          setAsk(next);
          return;
        }
        await onSave(next);
      }}
    >
      {ask && launch && (
        <div className="scope-ask" role="group" aria-label="Which ones move">
          <p>
            Move <strong>{launch.title}</strong> to {formatMinutes(toMinutes(ask.atTime))} for…
          </p>
          <div className="reminder-actions scope-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setAsk(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                const runToday = isoDate(launchDate(launch, today));
                const day = happensToday(launch, today) ? runToday : nextDate(launch, today) ?? runToday;
                const label = day === runToday ? 'today' : day;
                setScope(label);
                await onSave({ ...ask, atTime: launch.atTime, onceTime: { date: day, atTime: ask.atTime } });
              }}
            >
              {happensToday(launch, today) ? 'Today only' : 'Next one only'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                setScope('all');
                await onSave({ ...ask, onceTime: null });
              }}
            >
              Every time
            </button>
          </div>
        </div>
      )}
      <label className="field">
        <span>What</span>
        <TitleCombo value={cat} titles={categories} placeholder="Work Block #1" onChange={(v) => setWhat(v, desc)} />
      </label>
      <label className="field">
        <span>Description</span>
        <TitleCombo value={desc} titles={descriptions} required={false} placeholder="Launch Page Construction" onChange={(v) => setWhat(cat, v)} />
      </label>
      {rituals.length > 0 && (
        <label className="field">
          <span>Ritual · LAUNCH opens it to work through</span>
          <select
            value={d.ritualId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              setD((x) => ({ ...x, ritualId: id, title: x.title.trim() ? x.title : rituals.find((r) => r.id === id)?.name ?? '' }));
            }}
          >
            <option value="">None</option>
            {rituals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="time-grid">
        <label className="field">
          <span>{d.repeat === 'hourly' ? 'From' : 'Time'}</span>
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
        {d.repeat === 'hourly' && (
          <label className="field">
            <span>Until (last one)</span>
            <input type="time" required value={d.untilTime ?? ''} onChange={(e) => set('untilTime', e.target.value || null)} />
          </label>
        )}
      </div>

      <div className="time-grid">
        <label className="field">
          <span>Logs when checked off</span>
          <select
            value={d.logKind ?? ''}
            onChange={(e) => {
              const k = (e.target.value || null) as LaunchLogKind | null;
              setD((x) => ({ ...x, logKind: k, logAmount: k === 'h2o' ? 500 : k === 'vices' ? 1 : k === 'food' ? x.logAmount ?? null : null }));
            }}
          >
            <option value="">{d.urls.length || d.ritualId ? 'Auto: Productivity, time spent' : 'Nothing (a reminder)'}</option>
            {LOG_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {d.logKind === 'h2o' && (
          <label className="field">
            <span>Size</span>
            <select value={d.logAmount ?? 500} onChange={(e) => set('logAmount', Number(e.target.value))}>
              <option value={500}>Glass · 500 ml</option>
              <option value={750}>Bottle · 750 ml</option>
            </select>
          </label>
        )}
        {d.logKind === 'food' && (
          <label className="field">
            <span>Calories (kcal)</span>
            <input type="number" min={0} step="any" value={d.logAmount ?? ''} onChange={(e) => set('logAmount', Number(e.target.value) || 0)} />
          </label>
        )}
        {d.logKind === 'vices' && (
          <label className="field">
            <span>Weight</span>
            <select value={d.logAmount ?? 1} onChange={(e) => set('logAmount', Number(e.target.value))}>
              <option value={0.5}>Light · 0.5</option>
              <option value={1}>Medium · 1</option>
              <option value={3}>Heavy · 3</option>
            </select>
          </label>
        )}
      </div>
      {d.logKind && (
        <p className="field-hint timed-log-hint">
          {d.logKind === 'activity' || d.logKind === 'rest'
            ? `Logs the time allotted (${d.minutes} min) every time.`
            : d.logKind === 'productivity'
              ? d.urls.length || d.ritualId
                ? 'Logs the time from Launch to Done as work blocks.'
                : `Logs the time allotted as work blocks (${Math.round((d.minutes / 90) * 4) / 4}).`
              : 'Logs this amount every time.'}{' '}
          {'Checking it off (✓) logs it.'}
        </p>
      )}

      <fieldset className="field">
        <legend>Alarm</legend>
        <div className="choice-row tone-row" role="radiogroup" aria-label="Alarm sound">
          {TONES.map((t) => (
            <label key={t.id} className="choice">
              <input
                type="radio"
                name="tone"
                checked={d.sound && (isTone(d.tone) ? d.tone : 'marimba') === t.id}
                onChange={() => {
                  setD((x) => ({ ...x, sound: true, tone: t.id }));
                  chime('start', t.id);
                }}
                // Tap the picked sound again to turn the alarm off (no None button).
                onClick={() => d.sound && (isTone(d.tone) ? d.tone : 'marimba') === t.id && set('sound', false)}
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
        <p className="field-hint">Tap a sound to hear it and pick it; tap it again for no sound. It plays at launch time, and twice when the time allotted runs out.</p>
      </fieldset>

      <fieldset className="field">
        <legend>Repeats</legend>
        <div className="choice-row">
          {(['weekly', 'monthly', 'once', 'hourly'] as Repeat[]).map((r) => (
            <label key={r} className="choice">
              <input
                type="radio"
                name="repeat"
                checked={d.repeat === r}
                onChange={() => setD((x) => ({ ...x, repeat: r, untilTime: r === 'hourly' ? x.untilTime ?? '06:00' : x.untilTime, onDate: r === 'once' ? onceDate(x.onDate) : x.onDate }))}
              />
              <span>{r === 'weekly' ? 'Weekly' : r === 'monthly' ? 'Monthly' : r === 'once' ? 'Once' : 'Hourly'}</span>
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
        <fieldset className="field">
          <legend>Date</legend>
          {/* Once on a few picked dates: + adds another (Oct 20). */}
          <div className="once-dates">
            <div className="once-date">
              <input type="date" value={d.onDate ?? ''} onChange={(e) => set('onDate', e.target.value || null)} aria-label="Date" />
              <button type="button" className="icon-btn tool-btn" aria-label="Add another date" title="Add another date" onClick={() => set('moreDates', [...(d.moreDates ?? []), nextFree(d)])}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            {(d.moreDates ?? []).map((x, i) => (
              <div key={i} className="once-date">
                <input type="date" value={x} onChange={(e) => set('moreDates', (d.moreDates ?? []).map((y, j) => (j === i ? e.target.value : y)))} aria-label={`Date ${i + 2}`} />
                <button type="button" className="icon-btn tool-btn" aria-label={`Remove date ${i + 2}`} title="Remove this date" onClick={() => set('moreDates', (d.moreDates ?? []).filter((_, j) => j !== i))}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="field">
        <legend>Rockets to launch</legend>
        <RocketPicker options={rocketOptions(launchers)} picked={d.urls} onChange={(urls) => set('urls', urls)} onAddNew={onAddRocket} />
        <p className="field-hint">Apps: the first time, your browser asks to open the app. Tick “Always allow” and it opens straight away after that.</p>
      </fieldset>

      <FormActions formId={formId} saveDisabled={!d.title.trim()} onDelete={launch ? () => onDelete(launch.id) : undefined} deleteLabel={launch?.title} />
    </form>
  );
}

/** "What": type a new name, or open the list with ⌄ (or by typing) and pick one you've used before. */
export function TitleCombo({ value, titles, onChange, placeholder = 'Work Block #1 - Launch Page Construction', required = true, autoFocus }: { value: string; titles: string[]; onChange: (v: string) => void; placeholder?: string; required?: boolean; autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const shown = (filtering && q ? titles.filter((t) => t.toLowerCase().includes(q)) : titles).filter((t) => t !== value);
  const pick = (t: string) => {
    onChange(t);
    setOpen(false);
    setFiltering(false);
  };
  return (
    <div className="combo" ref={wrap} onBlur={(e) => !wrap.current?.contains(e.relatedTarget as Node) && setOpen(false)}>
      <input
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setFiltering(true);
          setOpen(e.target.value.trim().length > 0);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            else setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && shown[hi]) {
            e.preventDefault();
            pick(shown[hi]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {titles.length > 0 && (
        <button
          type="button"
          className="combo-caret"
          aria-label={open ? 'Hide the list' : 'Pick a name used before'}
          title="Pick a name used before"
          tabIndex={-1}
          onClick={() => {
            setFiltering(false);
            setHi(0);
            setOpen((x) => !x);
          }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </button>
      )}
      {open && shown.length > 0 && (
        <ul className="combo-list" role="listbox" id={listId}>
          {shown.map((t, i) => (
            <li key={t} role="option" aria-selected={i === hi}>
              <button type="button" className={`combo-opt combo-opt-plain ${i === hi ? 'is-hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(t)}>
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ComboOption = { name: string; note: string; url: string; color: TileColor; kind: string; /** A hidden rocket: picking it brings that one back. */ id?: string };
export type RocketOption = ComboOption;

/** A rocket's name from its link: todoist:// → Todoist, https://www.atb.com/x → atb.com. */
export function nameFromUrl(url: string) {
  const app = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (app && !/^https?$/i.test(app[1])) return (app[1][0].toUpperCase() + app[1].slice(1)).slice(0, NAME_MAX);
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, NAME_MAX);
  } catch {
    return url.slice(0, NAME_MAX);
  }
}

/** Everything a launch or a ritual step can open: your rockets, then the originals and apps you don't have yet. */
export function rocketOptions(tiles: Launcher[]): RocketOption[] {
  const out: RocketOption[] = [];
  const add = (o: RocketOption) => {
    if (o.url && !out.some((x) => x.url === o.url)) out.push(o);
  };
  for (const t of tiles) add({ name: t.name, note: t.note, url: t.url, color: t.color, kind: 'Rocket' });
  for (const p of LAUNCHER_PRESETS) add({ name: p.name, note: p.note, url: p.url, color: p.color, kind: 'Original' });
  for (const a of APP_LINKS) add({ name: a.name, note: 'App', url: a.url, color: 'purple', kind: 'App' });
  for (const c of CARD_LINKS) add({ name: c.name, note: 'LaunchPage card', url: c.url, color: 'green', kind: 'Card' });
  return out;
}

/**
 * Pick rockets from the list; each one picked sits underneath as a ticked box, and unticking
 * sends it back to the list. "Add new rocket" takes one link and makes it a rocket (Oct 20).
 * single: a ritual step opens one rocket.
 */
export function RocketPicker({ options, picked, onChange, onAddNew, single }: { options: RocketOption[]; picked: string[]; onChange: (urls: string[]) => void; onAddNew?: (url: string) => Promise<void>; single?: boolean }) {
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const left = options.filter((o) => !picked.includes(o.url));
  const labelFor = (u: string) => options.find((o) => o.url === u)?.name ?? nameFromUrl(u);
  const add = (u: string) => onChange(single ? [u] : [...picked.filter((x) => x !== u), u]);
  const open = !single || picked.length === 0;
  async function addNew() {
    const u = normalizeUrl(link);
    if (!u || isBarePrefix(u) || busy) return;
    setBusy(true);
    try {
      if (onAddNew && !options.some((o) => o.url === u)) await onAddNew(u);
      add(u);
      setLink('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rocket-picker">
      {open && (
        <NameCombo
          value={q}
          options={left}
          required={false}
          onType={setQ}
          onPick={(o) => {
            add(o.url);
            setQ('');
          }}
          placeholder={single ? 'Pick a rocket' : 'Pick rockets to launch'}
        />
      )}
      {picked.length > 0 && (
        <div className="tab-picks">
          {picked.map((u) => (
            <label key={u} className="choice">
              <input type="checkbox" checked onChange={() => onChange(picked.filter((x) => x !== u))} aria-label={`Remove ${labelFor(u)}`} />
              <span>{labelFor(u)}</span>
            </label>
          ))}
        </div>
      )}
      {open && (
        <div className="rocket-new">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addNew();
              }
            }}
            placeholder="Add new rocket: paste a link (or an app link like todoist://)"
            aria-label="Add new rocket"
          />
          <button type="button" className="icon-btn tool-btn" aria-label="Add new rocket" title="Add new rocket" disabled={busy || !link.trim()} onClick={() => void addNew()}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/** Type a new name, or open the list with the ⌄ (or by typing) and pick an original or an app. */
function NameCombo({ value, options, onType, onPick, placeholder, required = true }: { value: string; options: ComboOption[]; onType: (v: string) => void; onPick: (o: ComboOption) => void; placeholder: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const shown = filtering && q ? options.filter((o) => o.name.toLowerCase().includes(q) || o.note.toLowerCase().includes(q)) : options;
  const pick = (o: ComboOption) => {
    onPick(o);
    setOpen(false);
    setFiltering(false);
  };
  return (
    <div
      className="combo"
      ref={wrap}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        required={required}
        maxLength={NAME_MAX}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          const exact = options.find((o) => o.name.toLowerCase() === v.trim().toLowerCase());
          if (exact) return pick(exact);
          onType(v);
          setFiltering(true);
          setOpen(v.trim().length > 0);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) setOpen(true);
            else setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && open && shown[hi]) {
            e.preventDefault();
            pick(shown[hi]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {options.length > 0 && (
        <button
          type="button"
          className="combo-caret"
          aria-label={open ? 'Hide the list' : 'Show the list'}
          title="Pick from the list"
          tabIndex={-1}
          onClick={() => {
            setFiltering(false);
            setHi(0);
            setOpen((x) => !x);
          }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </button>
      )}
      {open && shown.length > 0 && (
        <ul className="combo-list" role="listbox" id={listId}>
          {shown.map((o, i) => (
            <li key={`${o.kind}-${o.name}`} role="option" aria-selected={i === hi}>
              <button type="button" className={`combo-opt ${i === hi ? 'is-hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
                <span className={`combo-dot tile-${o.color}`} aria-hidden="true" />
                <span className="combo-name">{o.name}</span>
                <span className="combo-note">{o.note === o.kind ? '' : o.note}</span>
                <span className="combo-kind">{o.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
