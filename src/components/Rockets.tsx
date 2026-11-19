import { useBeta } from '../lib/beta';
import { projectWhats, whatList } from '../lib/whats';
import { StatsPanel } from './Stats';
import type { Project } from '../lib/projects';
import { Fragment, useContext, useEffect, useLayoutEffect, useState, useId, useMemo, useRef } from 'react';
import { HiddenPicksContext, launchListFor, pickKey as hiddenKey } from '../lib/hiddenPicks';
import { FormActions, Sheet } from './Sheet';
import {
  describeSchedule,
  ROCKET_PRESETS,
  BETA_CARD_PAGES,
  happensOn,
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
  isHexColor,
  rocketUrls,
  tileClass,
  tileStyle,
  type Launch,
  type Rocket,
  type Repeat,
  type TileColor,
  runKey,
  opensSomething,
  runsOnClock,
  describeLog,
  dayOrder,
  missedRuns,
  MONTH_WEEK,
  runStart,
} from '../lib/rockets';
import { formatMinutes, toMinutes } from '../lib/routines';
import { chime, isTone, TONES } from '../lib/alerts';
import { CardExplain } from './CardExplain';
import { useMobile } from '../lib/useMobile';
import { defaultStart, finishIso, leftRunningGuess, startIso } from '../lib/logStart';
import { ackClash, clashesFor, hhmm12, isAcked, nextFree as nextOpenSlot, settledRuns, timingChanged, type Clash } from '../lib/schedule';
import { ClashSheet } from './ClashSheet';
import { OneMenu } from './OneMenu';
import { FoldTabs } from './FoldTabs';

/** What "+ Timed launch" hands over: the fields to fill in, and who to tell once it's saved. */
export type StepPick = { name: string; date: string | null };
export type TimedPreset = {
  fill: Partial<Launch>;
  n: number;
  onSaved?: (l: Launch) => void;
  /** V20-347 (Dan, Nov 19): a launch made from a task with steps: its open steps to pick from. */
  stepPicks?: StepPick[];
};

type Props = {
  routineName: string | null;
  /** New tiles belong to this routine only. */
  routineId: string | null;
  rockets: Rocket[];
  launches: Launch[];
  onSaveRocket: (l: Rocket) => Promise<void>;
  /** Saves a reordered set of tiles in one go. */
  onSaveRockets: (l: Rocket[]) => Promise<void>;
  onDeleteRocket: (id: string) => Promise<void>;
  onSaveLaunch: (l: Launch) => Promise<void>;
  onDeleteLaunch: (id: string) => Promise<void>;
  onStatus: (msg: string) => void;
  handled: Record<string, HandledHow | true>;
  today: Date;
  /** V20-073: logMin = minutes from the Log the time? prompt (null = Don't log); left out = no prompt. */
  onFinish: (l: Launch, how: 'done' | 'skipped', logMin?: number | null, startAt?: string | null) => void;
  /** Opens a timed launch's tabs and apps now, without waiting for its time. */
  onLaunchNow: (l: Launch) => void;
  /** Oct 25: pause / resume a launched run. */
  isPaused?: (l: Launch) => boolean;
  /** V20-178: minutes on the clock when a launched run is more than an hour past its time, else null. */
  overrun?: (l: Launch) => number | null;
  onPause?: (l: Launch) => void;
  /** Opens Add timed launch filled in (from a routine step or a task) to check before saving. */
  preset?: TimedPreset | null;
  /** Runs of each launch: today's +10 minutes show on the row. */
  log?: LaunchLog[];
  /** Oct 29 · Missed tab: done without logging time, or cleared out of the counts. */
  onSettleMissed?: (l: Launch, day: string, how: 'done' | 'cleared', logMin?: number | null, startAt?: string | null) => void;
  /** V20-216: Stats › + adds a log by hand (no launch). */
  onAddLog?: (x: { title: string; projectId: string | null; day: string; start: string; minutes: number }) => Promise<void>;
  /** V20-060: take a run out of the log (History → Undo). */
  onUndoRun?: (id: string) => void;
  /** V20-270 (Dan, Nov 16): fix a run on Complete: its date, start and minutes. */
  onEditRun?: (id: string, x: { day: string; start: string; minutes: number }) => void;
  /** V20-282: an open run counts on from this moment (the end of a part just logged). */
  onRunFrom?: (id: string, at: string) => void;
  /** V12-043: off days (a quiet card today; their runs aren't Missed). */
  offDays?: string[];
  offToday?: boolean;
  onPresetUsed?: () => void;
  /** Oct 25: opens Edit timed launch on this launch (from the reminder's Edit). */
  editLaunch?: Launch | null;
  onEditOpened?: () => void;
  /** Rituals a timed launch can open (26 Days). */
  rituals?: { id: string; name: string }[];
  /** V20-074: projects a timed launch can count toward. */
  projects?: { id: string; name: string; parentId: string | null; sort: number; status?: string; shortName?: string }[];
  /** V20-185: past routine days and whether each was a baseline day (Stats). */
  baseline?: { day: string; on: boolean }[];
};

/** What fits on one line of a fixed-width tile. */
const NAME_MAX = 14;
const NOTE_MAX = 20;

const COLORS: TileColor[] = ['teal', 'purple', 'green', 'pink'];
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Nov 11 (V20-061): All and History came out. History split in two: Missed = every run not done
// (never settled, skipped or cleared), Complete = every done run.
type TimedView = 'active' | 'tomorrow' | 'scheduled' | 'missed' | 'complete' | 'stats';


const TIMED_VIEWS: [TimedView, string][] = [
  ['active', 'Active'],
  ['tomorrow', 'Tomorrow'],
  ['scheduled', 'Scheduled'],
  ['missed', 'Missed'],
  ['complete', 'Complete'],
  ['stats', 'Stats']
];

const EMPTY: Record<TimedView, string> = {
  active: 'Nothing left to launch today.',
  complete: 'Nothing checked off yet.',
  missed: 'Nothing missed, skipped or cleared.',
  tomorrow: 'Nothing scheduled for tomorrow.',
  scheduled: 'Nothing switched on and ahead.',
  stats: 'No runs in the last 14 days yet.'
};

/** Typing a link starts from https://www. so you only add the rest. */
const isBarePrefix = (v: string) => /^https?:\/\/(www\.)?$/i.test(v.trim());
/** V20-301: a typed or pasted link made whole: a doubled start ("https://www.https://…") loses the extra, and a bare
 *  address ("app.claude.com") gets https://. App and card links pass as they are. */
export const cleanLink = (v: string) => {
  // V20-304: also a leftover www. in front ("www.https://docs…").
  let u = v.trim().replace(/^(https?:\/\/)?(www\.)?(?=https?:\/\/)/i, '');
  if (!u || isBarePrefix(u)) return '';
  // Has its own scheme (https://, mailto:, an app link like notion://) or a card path: leave it; else add https://.
  if (!/^[a-z][a-z0-9+.-]*:(\/\/|[^\d])/i.test(u) && !u.startsWith('/')) u = `https://${u}`;
  return u;
};

/** V20-348: one word that reads as an address (has a dot or a scheme), not a rocket's name. */
const looksLikeLink = (v: string) => !!v && !/\s/.test(v) && (/:\/\//.test(v) || /\.[a-z]{2,}/i.test(v));

export const BLOCKED_HELP =
  'Your browser blocked some tabs. Allow pop-ups for this site, then launch again.';

export function RocketsPanel(p: Props) {
  const [editing, setEditing] = useState(false);
  const [tile, setTile] = useState<Rocket | null>(null);
  const [tileOpen, setTileOpen] = useState(false);
  const [timed, setTimed] = useState<Launch | null>(null);
  const [timedOpen, setTimedOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // V20-270: the Complete run being fixed (pencil on its row).
  // SCHEDULE GUARDRAILS phase 1 (Nov 16): the launch being saved and the blocks it overlaps.
  const [clash, setClash] = useState<{ l: Launch; with: Clash[] } | null>(null);
  // V20-278 (Dan, Nov 16): after a part log, when the rest of it happens.
  const [rest, setRest] = useState<Launch | null>(null);
  // Today's open run of a launch (started, not finished): rescheduling the rest closes it, the part log holds the time.
  const openRun = (l: Launch) => (p.log ?? []).find((g) => g.launchId === l.id && !g.finishedAt && g.outcome === 'launched');
  async function moveRest(l: Launch, next: Launch | null) {
    const run = openRun(l);
    if (run) p.onUndoRun?.(run.id);
    setRest(null);
    if (next) {
      await p.onSaveLaunch(next);
    } else {
      setTimed(l);
      setTimedOpen(true);
    }
  }
  async function saveTimed(l: Launch) {
    await p.onSaveLaunch(l);
    if (!timed) fill?.onSaved?.(l);
    setFill(null);
    setTimedOpen(false);
    setClash(null);
  }
  const [runEdit, setRunEdit] = useState<{ id: string; title: string; day: string; start: string; minutes: number } | null>(null);
  const [fill, setFill] = useState<TimedPreset | null>(null);
  useEffect(() => {
    if (!p.preset) return;
    setTimed(null);
    setFill(p.preset);
    setTimedOpen(true);
    p.onPresetUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.preset]);
  useEffect(() => {
    const l = p.editLaunch;
    if (!l) return;
    setFill(null);
    setTimed(l);
    setTimedOpen(true);
    p.onEditOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editLaunch]);
  const [launched, setLaunched] = useState<{ count: number; blocked: number } | null>(null);
  // Nov 5 (V20-028): edit mode drags rockets into a new order (⠿ grip; mouse and touch) and × hides one.
  const visible = p.rockets.filter((l) => !l.hidden).slice().sort((a, b) => a.sort - b.sort);
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const byId = new Map(p.rockets.map((l) => [l.id, l] as const));
  const shownTiles = drag ? drag.order.map((id) => byId.get(id)).filter((l): l is Rocket => !!l) : visible;
  const moveTo = (order: string[], id: string, overId: string) => {
    if (id === overId) return order;
    const next = order.filter((x) => x !== id);
    const at = next.indexOf(overId);
    const from = order.indexOf(id);
    const to = order.indexOf(overId);
    next.splice(from < to ? at + 1 : at, 0, id);
    return next;
  };
  const saveOrder = (order: string[]) => {
    // Reuse the slots these rockets already hold, so rockets on other routines keep their places.
    const slots = visible.map((l) => l.sort).sort((a, b) => a - b);
    const ok = new Set(slots).size === slots.length;
    const changed = order
      .map((id, i) => {
        const l = byId.get(id)!;
        const sort = ok ? slots[i] : i;
        return l.sort === sort ? null : { ...l, sort };
      })
      .filter((l): l is Rocket => !!l);
    if (changed.length) void p.onSaveRockets(changed);
  };
  // Follow the pointer on the whole page while dragging: moving a tile in the list drops a pointer
  // capture on it, so the tile itself can't be relied on to hear the move and the drop.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const saveRef = useRef(saveOrder);
  saveRef.current = saveOrder;
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-rocket]')?.getAttribute('data-rocket');
      if (over && over !== d.id) {
        const next = { ...d, order: moveTo(d.order, d.id, over) };
        dragRef.current = next;
        setDrag(next);
      }
    };
    const up = () => {
      const d = dragRef.current;
      if (d) saveRef.current(d.order);
      dragRef.current = null;
      setDrag(null);
    };
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);
  const hideRocket = (l: Rocket) => {
    void p.onSaveRocket({ ...l, hidden: true });
    p.onStatus(`${l.name} hidden. Bring it back from + Add rocket.`);
  };
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
  const mobile = useMobile();
  const [view, setView] = useState<TimedView>('active');
  // The X on a row asks first: skip just today, or remove the launch for good.
  const [xAsk, setXAsk] = useState<string | null>(null);
  // V20-073 (Nov 12): checking off a run that never ran on the clock asks Log the time?
  // V20-183 (Dan, Nov 14): minutes only; Don't log is gone (no task takes 0 minutes).
  // Launches that log a fixed amount (H2O, Food, Vice) don't ask.
  // V20-268 (Dan, Nov 15): it also asks the Start (now − minutes, or a past day's set time), so the run keeps when it happened.
  type LogAsk = {
    key: string;
    minutes: number;
    onLog: (m: number | null, startAt?: string | null) => void;
    q?: string;
    start?: string;
    day?: string | null;
    atTime?: string | null;
    /** V20-273 (Dan, Nov 16): Part done. The launch, and (when on) what got done and what's left. */
    l?: Launch;
    part?: { done: string; left: string; ticked?: number[] } | null;
  };
  // "WHAT - PROJECT - description": a part keeps the first two pieces and swaps the description.
  const titleHead = (t: string) => {
    const parts = t.split(' - ');
    return parts.length >= 3 ? parts.slice(0, 2) : parts.slice(0, Math.max(1, parts.length - 1));
  };
  const titleRest = (t: string) => t.split(' - ').slice(titleHead(t).length).join(' - ');
  // V20-281: what Part can tick: the description (step 1), then the steps.
  const partItems = (l: Launch) => [titleRest(l.title), ...(l.steps ?? [])].filter((x) => x.trim());
  const [logAsk, setLogAsk] = useState<LogAsk | null>(null);
  const asksTime = (l: Launch) => !['h2o', 'food', 'vices'].includes(l.logKind ?? '');
  const askLog = (key: string, l: Launch, onLog: (m: number | null, startAt?: string | null) => void, day?: string | null) => {
    if (!asksTime(l)) return onLog(undefined as unknown as null);
    setXAsk(null);
    setLogAsk({ key, minutes: l.minutes, onLog, day: day ?? null, atTime: l.atTime ?? null, l, part: null });
  };
  const askStart = (a: LogAsk) => a.start ?? defaultStart(a.minutes, { day: a.day, atTime: a.atTime });
  const logAskUi = (key: string) =>
    logAsk?.key === key && (
      <div className="timed-quick timed-xask timed-logask" role="group" aria-label="Log the time?">
        <span className="logask-q">{logAsk.q ?? 'Log the time?'}</span>
        <label className="logask-min">
          <input
            type="number"
            min={1}
            max={480}
            value={logAsk.minutes}
            aria-label="Minutes to log"
            onChange={(e) => setLogAsk((a) => (a ? { ...a, minutes: Math.min(480, Math.max(1, Number(e.target.value) || 1)) } : a))}
          />
          <span>min</span>
        </label>
        <label className="logask-min logask-start">
          <span>Start</span>
          <input
            type="time"
            value={askStart(logAsk)}
            aria-label="Start time"
            onChange={(e) => setLogAsk((a) => (a ? { ...a, start: e.target.value || undefined } : a))}
          />
        </label>
        {logAsk.part && !!logAsk.l?.steps?.length && (
          <span className="logask-steps" role="group" aria-label="Steps that got done">
            {partItems(logAsk.l).map((x, i) => (
              <label key={i} className="logask-step">
                <input
                  type="checkbox"
                  checked={!!logAsk.part?.ticked?.includes(i)}
                  onChange={(e) =>
                    setLogAsk((a) => {
                      if (!a || !a.part) return a;
                      const t = new Set(a.part.ticked ?? []);
                      if (e.target.checked) t.add(i);
                      else t.delete(i);
                      return { ...a, part: { ...a.part, ticked: [...t].sort((m, n) => m - n) } };
                    })
                  }
                />
                <span>{x}</span>
              </label>
            ))}
          </span>
        )}
        {logAsk.part && !logAsk.l?.steps?.length && (
          <>
            <label className="logask-min logask-part">
              <span>Done</span>
              <input value={logAsk.part.done} placeholder="What got done" aria-label="What got done" onChange={(e) => setLogAsk((a) => (a && a.part ? { ...a, part: { ...a.part, done: e.target.value } } : a))} />
            </label>
            <label className="logask-min logask-part">
              <span>Left</span>
              <input value={logAsk.part.left} placeholder="What's left" aria-label="What's left" onChange={(e) => setLogAsk((a) => (a && a.part ? { ...a, part: { ...a.part, left: e.target.value } } : a))} />
            </label>
          </>
        )}
        {logAsk.l && p.onAddLog && !logAsk.part && (
          <button
            type="button"
            className="btn btn-quiet"
            title="Part done: log what got done; the launch stays open for what's left"
            onClick={() => setLogAsk((a) => (a && a.l ? { ...a, part: { done: '', left: titleRest(a.l.title) } } : a))}
          >
            Part
          </button>
        )}
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!!logAsk.part && (logAsk.l?.steps?.length ? !logAsk.part.ticked?.length : !logAsk.part.done.trim())}
          onClick={async () => {
            const a = logAsk;
            setLogAsk(null);
            if (!a.part || !a.l) return a.onLog(a.minutes, startIso(askStart(a), a.minutes, a.day));
            // V20-273: the done part is its own log (like Stats › Add a log); the launch stays open, renamed to what's left.
            const head = titleHead(a.l.title);
            // V20-282: the open run picks up where this part ended.
            const partStart = startIso(askStart(a), a.minutes, a.day);
            const open = openRun(a.l);
            if (open) p.onRunFrom?.(open.id, finishIso(partStart, a.minutes));
            // V20-277: with steps, the ticked ones are the part done (joined with +) and the rest stay on the launch.
            // V20-281: the description (after What and project) is step 1, so it can be ticked too.
            if (a.l.steps?.length) {
              const items = partItems(a.l);
              const ticked = a.part.ticked ?? [];
              const doneText = ticked.map((i) => items[i]).join(' + ');
              await p.onAddLog?.({ title: [...head, doneText].join(' - '), projectId: a.l.projectId ?? null, day: a.day ?? isoDate(p.today), start: askStart(a), minutes: a.minutes });
              const off = items.length - (a.l.steps?.length ?? 0); // 1 when the description is an item
              const stepsLeft = (a.l.steps ?? []).filter((_, i) => !ticked.includes(i + off));
              const descDone = off === 1 && ticked.includes(0);
              // The description got done: the first step left takes its place.
              const restL = {
                ...a.l,
                title: descDone && stepsLeft.length ? [...head, stepsLeft[0]].join(' - ') : a.l.title,
                steps: descDone ? stepsLeft.slice(1) : stepsLeft,
                minutes: Math.max(5, a.l.minutes - a.minutes)
              };
              await p.onSaveLaunch(restL);
              setRest(restL);
              return;
            }
            await p.onAddLog?.({ title: [...head, a.part.done.trim()].join(' - '), projectId: a.l.projectId ?? null, day: a.day ?? isoDate(p.today), start: askStart(a), minutes: a.minutes });
            const left = a.part.left.trim();
            const title = left ? [...head, left].join(' - ') : a.l.title;
            const minutes = Math.max(5, a.l.minutes - a.minutes);
            const restL = { ...a.l, title, minutes };
            if (title !== a.l.title || minutes !== a.l.minutes) await p.onSaveLaunch(restL);
            setRest(restL);
          }}
        >
          {logAsk.part ? 'Log part' : 'Log'}
        </button>
        {/* V20-196 (Dan, Nov 14): Cancel is an ×, like the card's ×. */}
        <button type="button" className="quick-btn" aria-label="Cancel" title="Cancel" onClick={() => setLogAsk(null)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    );
  const ordered = orderLaunches(p.launches, p.today, p.handled);
  // The next routine day: 24 hours on from now (the day rolls over at the routine's reset, not midnight).
  const tomorrow = new Date(p.today.getTime() + 86_400_000);
  const stateOf = (l: Launch) => {
    const h = p.handled[runKey(l, p.today)];
    return h === true ? 'done' : h;
  };
  // V20-067 (Nov 12): Tomorrow and Scheduled skip runs already done, skipped, cleared or running (they live
  // in Complete, Missed or Active), so a launch shows its next open run.
  const logged = new Set((p.log ?? []).map((g) => `${g.launchId}:${g.day}`));
  const nextOf = (l: Launch): string | null => {
    const first = nextDate(l, p.today);
    if (!first || !logged.has(`${l.id}:${first}`)) return first;
    for (let i = 0; i < 62; i++) {
      const d = new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate() + i, 12);
      const iso = isoDate(d);
      if (iso > first && happensOn(l, d) && !logged.has(`${l.id}:${iso}`)) return iso;
    }
    return null;
  };
  const views: Record<TimedView, Launch[]> = {
    active: ordered.filter((l) => l.active && happensToday(l, p.today) && (!stateOf(l) || stateOf(l) === 'launched')),
    tomorrow: [...p.launches]
      .filter((l) => l.active && happensToday(l, tomorrow) && !logged.has(`${l.id}:${isoDate(launchDate(l, tomorrow))}`))
      .sort((a, b) => dayOrder(a.atTime) - dayOrder(b.atTime)),
    // Scheduled (Oct 22): every launch that's on and still ahead, once each (not once per day),
    // soonest first, so you can look forward without the daily ones repeating.
    scheduled: p.launches
      .filter((l) => l.active && nextOf(l))
      .sort((a, b) => (nextOf(a) ?? '').localeCompare(nextOf(b) ?? '') || dayOrder(a.atTime) - dayOrder(b.atTime)),
    missed: [],
    complete: [],
    stats: []
  };
  // Missed (Oct 29): past runs never settled, one row per run (a launch can miss several days).
  const missed = missedRuns(p.launches, p.log ?? [], p.today, 7, new Set(p.offDays ?? []));
  // History (Oct 22): every finished run, newest first.
  const history = (p.log ?? [])
    .filter((g) => g.outcome !== 'launched' || g.finishedAt)
    .sort((a, b) => (b.finishedAt ?? b.launchedAt ?? b.day).localeCompare(a.finishedAt ?? a.launchedAt ?? a.day));
  const isDone = (g: (typeof history)[number]) => g.outcome === 'done' || g.outcome === 'launched';
  const runTime = (g: (typeof history)[number]) => {
    if (g.launchedAt) {
      const t = new Date(g.launchedAt);
      return t.getHours() * 60 + t.getMinutes();
    }
    const l = p.launches.find((x) => x.id === g.launchId);
    return l ? toMinutes(l.atTime) : null;
  };
  // V20-270: Complete groups a run by the day it happened (its routine day), falling back to its launch's day.
  const runDay = (g: (typeof history)[number]) => g.routineDay ?? g.day;
  const doneRuns = history
    .filter(isDone)
    .sort((a, b) => runDay(b).localeCompare(runDay(a)) || (runTime(a) ?? 0) - (runTime(b) ?? 0));
  // V20-062 (revised): Missed = runs never settled, plus skipped runs (each can still be started, checked
  // off or removed). Cleared runs were taken out on purpose, so they stay out. A skipped run whose launch
  // was deleted gets a stand-in so it can still be checked off or removed (no start or edit).
  const missedRows = [
    ...missed.map((m) => ({ ...m, kind: 'missed' as const, gone: false })),
    ...history
      .filter((g) => g.outcome === 'skipped')
      .map((g) => {
        const l = p.launches.find((x) => x.id === g.launchId);
        return {
          launch: l ?? ({ id: g.launchId, title: g.title, atTime: '12:00', minutes: g.planned, repeat: 'once' } as Launch),
          day: g.day,
          kind: 'skipped' as const,
          gone: !l
        };
      })
  ].sort((a, b) => b.day.localeCompare(a.day));
  // V20-062 (Nov 11): ▶ on a missed run. The missed day is taken out of the counts, the launch moves
  // to today (Active), and it starts now.
  async function startMissedNow(l: Launch, day: string | null) {
    if (day) p.onSettleMissed?.(l, day, 'cleared');
    // A one-time launch starts over: today, at this minute, so its clock runs its full time from now
    // (V20-063: it kept its old date and time, so Time's up popped at once and added the lost hours).
    const n = new Date();
    const nowAt = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    const today = isoDate(launchDate({ ...l, atTime: nowAt }, n));
    const moved =
      l.repeat === 'once'
        ? { ...l, onDate: today, atTime: nowAt, movedTo: null, active: true }
        : happensToday(l, p.today)
          ? l
          : { ...l, movedTo: isoDate(launchDate(l, p.today)), active: true };
    if (moved !== l) await p.onSaveLaunch(moved);
    p.onLaunchNow(moved);
  }
  // V20-069 (Nov 12): a Complete row, styled like Scheduled: a date line above each day (11/12/26, solid
  // colour-1 line), the time it started on the left (or its set time if it was ticked off without starting),
  // then the name and the minutes. No Undo.
  const runItem = (g: (typeof history)[number], i: number, arr: (typeof history)[number][]) => {
    // V12-003: time spent leaves pauses out (the logged minutes when the clock timed it).
    const spent =
      g.timeSource === 'timed' && g.loggedMin != null
        ? g.loggedMin
        : g.launchedAt && g.finishedAt
          ? Math.max(0, Math.round((new Date(g.finishedAt).getTime() - new Date(g.launchedAt).getTime()) / 60_000 - (g.pausedMin ?? 0)))
          : null;
    const t = runTime(g);
    const gDay = runDay(g);
    const showDay = i === 0 || runDay(arr[i - 1]) !== gDay;
    return (
      <Fragment key={g.id}>
        {showDay && (
          <li className="timed-day" aria-label={new Date(`${gDay}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}>
            <span className="timed-day-date">{`${gDay.slice(5, 7)}/${gDay.slice(8, 10)}/${gDay.slice(2, 4)}`}</span>
            <span className="timed-day-line" aria-hidden="true" />
          </li>
        )}
        <li className="timed-item is-run">
          <div className="timed-row">
            <span className="timed-time">{t === null ? '' : formatMinutes(t)}</span>
            <span className="timed-name">{g.title}</span>
            <span className="timed-meta">
              {new Date(`${gDay}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} · {spent ?? g.planned + g.extra} min
              {spent === null ? ' planned' : ' spent'}
              {g.extra > 0 && ` · +${g.extra} added`}
              {!g.launchedAt && ' · checked off without starting'}
            </span>
          </div>
          <div className="timed-quick">
            {p.onEditRun && (
              <button
                type="button"
                className="quick-btn quick-skip"
                aria-label={`Fix ${g.title}`}
                title="Fix this run: date, start, minutes, or Not done (back to Missed)"
                onClick={() => {
                  const st = g.launchedAt ? new Date(g.launchedAt) : null;
                  const at = st ? `${String(st.getHours()).padStart(2, '0')}:${String(st.getMinutes()).padStart(2, '0')}` : t === null ? '12:00' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
                  setRunEdit({ id: g.id, title: g.title, day: g.routineDay ?? g.day, start: at, minutes: spent ?? (g.loggedMin || g.planned + g.extra) });
                }}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="quick-btn quick-again"
              aria-label={`New launch from ${g.title}`}
              title="New launch from this one: Add opens filled in, pick the date and time"
              onClick={() => launchAgain(g)}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                <path d="M5.5 15.5v6M2.5 18.5h6" />
              </svg>
            </button>
          </div>
        </li>
      </Fragment>
    );
  };
  // V20-070 (Nov 12): rocket + on a Complete row opens Add timed launch filled in from that run's launch
  // (or just its name and minutes if the launch is gone), as a one-time launch today, same time.
  function launchAgain(g: (typeof history)[number]) {
    const l = p.launches.find((x) => x.id === g.launchId);
    const { id: _drop, sort: _sort, ...rest } = l ?? ({} as Launch);
    void _drop;
    void _sort;
    const fill: Partial<Launch> = l
      ? { ...rest, repeat: 'once', onDate: isoDate(p.today), moreDates: [], movedTo: null, active: true }
      : { title: g.title, minutes: g.planned, repeat: 'once', onDate: isoDate(p.today) };
    setTimed(null);
    setFill({ fill, n: Date.now() });
    setTimedOpen(true);
  }
  // V20-071: Stats has no count.
  const countOf = (id: TimedView): number | undefined =>
    id === 'stats' ? undefined : id === 'complete' ? doneRuns.length : id === 'missed' ? missedRows.length : views[id].length;
  const list = views[view];
  // Active keeps to the next 3 (Show all for the rest); the other tabs show their whole list.
  const capped = view === 'active' && !showAllTimed;
  // Nov 1: lists come in pages of 3. On a phone you swipe left for the next 3 (every tab but History);
  // on a laptop Active still shows the first 3 only, and Show all stacks the whole list.
  const pages: (typeof list)[] = [];
  if (showAllTimed || (!mobile && !capped)) pages.push(list);
  else if (!mobile) pages.push(list.slice(0, 3));
  else for (let i = 0; i < list.length; i += 3) pages.push(list.slice(i, i + 3));
  const [page, setPage] = useState(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPage(0);
    pagesRef.current?.scrollTo({ left: 0 });
  }, [view, showAllTimed]);

  function launchAll() {
    const urls = p.rockets.filter((l) => !l.hidden).flatMap((l) => rocketUrls(l)).filter(Boolean);
    if (!urls.length) return p.onStatus('Add links to your tiles first.');
    const blocked = openTabs(urls);
    setLaunched({ count: urls.length, blocked });
    p.onStatus(blocked ? BLOCKED_HELP : `Launched ${urls.length} tabs.`);
  }

  return (
    <section className={`panel panel-rockets${showTiles ? '' : ' tiles-hidden'}`} aria-labelledby="h-rockets">
      <CardExplain k="rockets" />
      <CardExplain k="timed" />
      <CardExplain k="logging" />
      <div className="panel-head">
        <div className="rockets-title">
          <h2 id="h-rockets" className="panel-title hover-title" data-k="rockets">
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
          <button type="button" className="icon-btn tool-btn tool-btn-go" aria-label="Launch all" title="Launch all" onClick={launchAll}>
            <Icon d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </button>
          {/* V20-203 (Dan, Nov 14): + on the outside. */}
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
        {shownTiles.map((l) => (
          <li key={l.id} data-rocket={l.id} className={`${editing ? 'tile-slot' : ''}${drag?.id === l.id ? ' is-dragging' : ''}`}>
            {editing && (
              <>
                <button type="button" className="tile-x" aria-label={`Hide ${l.name}`} title="Hide from L4UNCH P4GE" onClick={() => hideRocket(l)}>
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <span
                  className="tile-grip"
                  role="button"
                  tabIndex={0}
                  aria-label={`Move ${l.name} (drag, or use the arrow keys)`}
                  title="Drag to move"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const d = { id: l.id, order: visible.map((x) => x.id) };
                    dragRef.current = d;
                    setDrag(d);
                  }}
                  onKeyDown={(e) => {
                    const order = visible.map((x) => x.id);
                    const i = order.indexOf(l.id);
                    const j = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : -2;
                    if (j < 0 || j >= order.length) return;
                    e.preventDefault();
                    saveOrder(moveTo(order, l.id, order[j]));
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
              </>
            )}
            {editing || !l.url ? (
              <button
                type="button"
                className={`tile tile-edit${l.hidden ? ' tile-hidden' : ''}`}
                onClick={() => {
                  setTile(l);
                  setTileOpen(true);
                }}
              >
                <span className={`tile-badge ${tileClass(l.color)}`} style={tileStyle(l.color)} aria-hidden="true">
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
                  if (openCard(l.url)) return e.preventDefault();
                  // V20-300: a rocket with several links opens them all.
                  const all = rocketUrls(l);
                  if (all.length > 1) {
                    e.preventDefault();
                    const blocked = openTabs(all);
                    if (blocked) p.onStatus(BLOCKED_HELP);
                  }
                }}
              >
                <span className={`tile-badge ${tileClass(l.color)}`} style={tileStyle(l.color)} aria-hidden="true">
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
            <h3 className="timed-title hover-title" data-k="timed">Timed launches</h3>
            {mobile ? (
              <OneMenu
                label="Timed launches"
                items={TIMED_VIEWS.map(([id, label]) => ({ id, label, count: countOf(id) }))}
                value={view}
                onPick={(id) => {
                  setView(id);
                  setShowAllTimed(false);
                }}
                className="timed-menu"
              />
            ) : (
            <FoldTabs
              label="Timed launches"
              items={TIMED_VIEWS.map(([id, label]) => ({ id, label, count: countOf(id), hoverKey: id === 'complete' ? 'logging' : undefined }))}
              value={view}
              onPick={(id) => {
                setView(id);
                setShowAllTimed(false);
              }}
            />
            )}
          </div>
          <button
            type="button"
            className="icon-btn tool-btn is-key"
            aria-label={view === 'stats' ? 'Add a log' : 'Add a timed launch'}
            title={view === 'stats' ? 'Add a log (work done without a launch)' : 'Add timed launch'}
            onClick={() => {
              // V20-216 (Dan, Nov 14): in Stats, + adds to the record (a log), not a launch.
              if (view === 'stats' && p.onAddLog) return setLogOpen(true);
              setTimed(null);
              setFill(null);
              setTimedOpen(true);
            }}
          >
            {/* V20-218 (Dan, Nov 14): in Stats the button adds a log, so it looks like one: lines with a +. */}
            <Icon d={view === 'stats' && p.onAddLog ? 'M4 6h13M4 11h13M4 16h7M18 14v7M14.5 17.5h7' : 'M12 5v14M5 12h14'} />
          </button>
        </div>
        {p.offToday && view === 'active' && (
          <p className="d26-offday-note">Off day · technology break. Timed launches stay quiet today: no reminders, nothing counts as missed.</p>
        )}
        {view === 'missed' ? (
          missedRows.length === 0 ? (
            <p className="panel-empty timed-empty">{EMPTY.missed}</p>
          ) : (
            <>
            {missedRows.length > 0 && (
            <ul className="timed-list">
              {missedRows.slice(0, showAllTimed ? undefined : 30).map(({ launch: l, day, kind, gone }) => (
                <li key={`${l.id}:${day}`} className={`timed-item is-missed${logAsk?.key === `${l.id}:${day}` ? ' is-logask' : ''}`}>
                  <button
                    type="button"
                    className="timed-row"
                    title={gone ? 'This launch was deleted' : 'Edit this launch'}
                    onClick={() => {
                      if (gone) return;
                      setTimed(l);
                      setTimedOpen(true);
                    }}
                  >
                    <span className="timed-time">{new Date(`${day}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
                    <span className="timed-name">{l.title}</span>
                    <span className="timed-meta">
                      {formatMinutes(toMinutes(l.atTime))} · {l.minutes} min · {kind === 'skipped' ? 'skipped' : 'missed'}{gone ? ' · launch deleted' : ''}
                    </span>
                  </button>
                  <div className="timed-quick">
                    {!gone && (
                    <button
                      type="button"
                      className="quick-btn quick-launch"
                      aria-label={`Start ${l.title} now`}
                      title="Start now: it moves to today and the clock starts"
                      onClick={() => void startMissedNow(l, day)}
                    >
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 4v16l13-8z" />
                      </svg>
                    </button>
                    )}
                    <button
                      type="button"
                      className="quick-btn quick-done"
                      aria-label={`${l.title}: done, don't log the time`}
                      title="Done, but don't log the time (nothing goes to 26 Days)"
                      onClick={() => askLog(`${l.id}:${day}`, l, (m, st) => p.onSettleMissed?.(l, day, 'done', m, st), day)}
                    >
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="quick-btn quick-skip"
                      aria-label={`Remove ${l.title} from Missed`}
                      title="Remove from Missed: this run won't count either way"
                      onClick={() => p.onSettleMissed?.(l, day, 'cleared')}
                    >
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  {logAskUi(`${l.id}:${day}`)}
                </li>
              ))}
            </ul>
            )}
            </>
          )
        ) : view === 'complete' ? (
          doneRuns.length === 0 ? (
            <p className="panel-empty timed-empty">{EMPTY.complete}</p>
          ) : (
            <>
            <ul className="timed-list">{doneRuns.slice(0, showAllTimed ? undefined : 30).map(runItem)}</ul>
            </>
          )
        ) : view === 'stats' ? (
          // V20-185 (Dan, Nov 14): Stats like the CEO dashboard; the done rate per launch moved inside it.
          <StatsPanel launches={p.launches} log={p.log ?? []} projects={(p.projects ?? []) as Project[]} today={p.today} offDays={p.offDays ?? []} baseline={p.baseline ?? []} />
        ) : list.length === 0 ? (
          <p className="panel-empty timed-empty">{p.launches.length === 0 ? 'At a set time, a reminder pops up and one tap opens every tab you need.' : EMPTY[view]}</p>
        ) : (
          <>
          <div
            ref={pagesRef}
            className={`timed-pages${pages.length > 1 ? ' is-paged' : ''}`}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.clientWidth) setPage(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
          {(() => {
          // V20-048: the first of today's launches still to do gets the teal box, like the routine's NOW card.
          let nextMarked = false;
          return pages.map((items, pi) => (
          <ul className="timed-list" key={pi} aria-label={pages.length > 1 ? `Page ${pi + 1} of ${pages.length}` : undefined}>
            {items.map((l, li) => {
              // Tomorrow shows plain rows: today's check-offs belong to today.
              const ahead = view === 'tomorrow' || view === 'scheduled';
              // V20-065 (Nov 11): Tomorrow and Scheduled get a date line (11/11/26 then a solid colour-1 line)
              // above each day's launches.
              const dayOf = (x: Launch) => (view === 'tomorrow' ? isoDate(tomorrow) : view === 'scheduled' ? nextOf(x) : null);
              const day = dayOf(l);
              const showDay = !!day && (li === 0 || dayOf(items[li - 1]) !== day);
              // V20-067: in Tomorrow and Scheduled, the run each row stands for. Today's run gets Active's buttons.
              const runDay = view === 'tomorrow' ? isoDate(launchDate(l, tomorrow)) : view === 'scheduled' ? nextOf(l) : null;
              const todays = (!ahead || runDay === isoDate(launchDate(l, p.today))) && l.active && happensToday(l, p.today);
              const how = todays ? stateOf(l) : undefined;
              const later = ahead && !todays && !!runDay;
              const isNext = view === 'active' && todays && (!how || how === 'launched') && !nextMarked;
              if (isNext) nextMarked = true;
              return (
                <Fragment key={l.id}>
                {showDay && day && (
                  <li className="timed-day" aria-label={new Date(`${day}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}>
                    <span className="timed-day-date">{`${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(2, 4)}`}</span>
                    <span className="timed-day-line" aria-hidden="true" />
                  </li>
                )}
                <li className={`timed-item${how && how !== 'launched' ? ` is-${how}` : ''}${how === 'launched' ? ' is-launched' : ''}${isNext ? ' is-next' : ''}${logAsk && (logAsk.key === `${l.id}:today` || logAsk.key === `${l.id}:${runDay}`) ? ' is-logask' : ''}`}>
                  <button
                    type="button"
                    className="timed-row"
                    onClick={() => {
                      setTimed(l);
                      setTimedOpen(true);
                    }}
                  >
                    <span className="timed-time">{formatMinutes(toMinutes(ahead ? timeFor(l, tomorrow) : timeFor(l, p.today)))}</span>
                    {/* V20-280: steps read as part of the name, dash-separated. */}
                    <span className="timed-name">{[l.title, ...(l.steps ?? [])].join(' - ')}</span>
                    <span className="timed-meta">
                      {describeSchedule(l)} · {l.minutes} min
                      {(() => {
                        const g = !ahead && p.log?.find((x) => x.launchId === l.id && x.day === isoDate(launchDate(l, p.today)));
                        return g && g.extra > 0 ? ` (+${g.extra} → ${g.planned + g.extra} min)` : '';
                      })()}{' '}
                      {opensSomething(l) ? ` · ${describeOpens(l.urls)}` : ''}
                      {l.logKind ? ` · logs ${describeLog(l)}` : ''}
                      {l.sound && ' · 🔊'}
                      {!l.active && ' · off'}
                      {how === 'launched' && (p.isPaused?.(l) ? ' · paused, ▶ to resume' : ' · launched, check it off when done')}
                      {how === 'done' && ' · done today'}
                      {how === 'skipped' && (l.repeat === 'hourly' ? ' · skipped this hour' : ' · skipped, back tomorrow')}
                    </span>
                  </button>
                  {later && runDay && xAsk === l.id && (
                    <div className="timed-quick timed-xask" role="group" aria-label={`Skip or remove ${l.title}`}>
                      <button type="button" className="btn btn-quiet" onClick={() => { setXAsk(null); p.onSettleMissed?.(l, runDay, 'cleared'); }}>
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
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {later && runDay && xAsk !== l.id && (
                    <div className="timed-quick">
                      <button
                        type="button"
                        className="quick-btn quick-launch"
                        aria-label={`Start ${l.title} now`}
                        title="Start now: it moves to today and the clock starts"
                        onClick={() => void startMissedNow(l, null)}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7 4v16l13-8z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="quick-btn quick-done"
                        aria-label={`Check off ${l.title} early`}
                        title="Done early: this run is checked off (no time logged)"
                        onClick={() => askLog(`${l.id}:${runDay}`, l, (m, st) => p.onSettleMissed?.(l, runDay, 'done', m, st), runDay)}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="quick-btn quick-skip"
                        aria-label={`Skip or remove ${l.title}`}
                        title="Skip this run or remove the launch"
                        onClick={() => setXAsk(l.id)}
                      >
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}
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
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {todays && (!how || how === 'launched') && xAsk !== l.id && (
                    <div className="timed-quick">
                      {how === 'launched' && p.onPause ? (
                        // Oct 25: once launched, the rocket becomes Pause / Resume.
                        <button
                          type="button"
                          className={`quick-btn quick-pause${p.isPaused?.(l) ? ' is-paused' : ''}`}
                          aria-pressed={!!p.isPaused?.(l)}
                          aria-label={p.isPaused?.(l) ? `Resume ${l.title}` : `Pause ${l.title}`}
                          title={p.isPaused?.(l) ? 'Resume' : 'Pause: the clock stops'}
                          onClick={() => p.onPause?.(l)}
                        >
                          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d={p.isPaused?.(l) ? 'M7 4v16l13-8z' : 'M7 4h4v16H7zM13 4h4v16h-4z'} />
                          </svg>
                        </button>
                      ) : runsOnClock(l) && !opensSomething(l) ? (
                        <button type="button" className="quick-btn quick-launch" aria-label={`Start ${l.title} now`} title="Start the clock" onClick={() => p.onLaunchNow(l)}>
                          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 4v16l13-8z" />
                          </svg>
                        </button>
                      ) : opensSomething(l) ? (
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
                        onClick={() => {
                          // V20-178: left running more than an hour past its time: ask, starting from the time allotted.
                          const over = how === 'launched' && asksTime(l) ? p.overrun?.(l) ?? null : null;
                          if (over !== null) {
                            setXAsk(null);
                            // V20-276: start and minutes guessed from the real block (its set time today, if later than when it auto-started); Part works here too.
                            const run = (p.log ?? []).filter((g) => g.launchId === l.id && g.launchedAt && !g.finishedAt).sort((a, b) => (b.launchedAt ?? '').localeCompare(a.launchedAt ?? ''))[0];
                            const guess = leftRunningGuess(run?.launchedAt ?? null, runStart(l, new Date()));
                            return setLogAsk({ key: `${l.id}:today`, minutes: guess.minutes, start: guess.start, l, part: null, q: `On the clock ${Math.floor(over / 60)}h ${over % 60}m. Log the time?`, onLog: (m, st) => p.onFinish(l, 'done', m, st) });
                          }
                          return how === 'launched' ? p.onFinish(l, 'done') : askLog(`${l.id}:today`, l, (m, st) => p.onFinish(l, 'done', m, st));
                        }}
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
                  {logAskUi(`${l.id}:today`)}
                  {runDay && logAskUi(`${l.id}:${runDay}`)}
                </li>
                </Fragment>
              );
            })}
          </ul>
          ));
          })()}
          </div>
          {pages.length > 1 && (
            <div className="timed-dots" aria-hidden="true">
              {pages.map((_, i) => (
                <span key={i} className={i === page ? 'is-on' : ''} />
              ))}
              <span className="timed-dots-label">
                {page * 3 + 1}–{Math.min(page * 3 + 3, list.length)} of {list.length}
              </span>
            </div>
          )}
          </>
        )}
        {((view === 'active' && list.length > 3) || (view === 'complete' && doneRuns.length > 30) || (view === 'missed' && missedRows.length > 30)) && (
          <button
            type="button"
            className="timed-more"
            aria-expanded={showAllTimed}
            onClick={() => setShowAllTimed((v) => !v)}
          >
            {view === 'complete' || view === 'missed' ? (showAllTimed ? 'Show the latest 30' : `Show all ${view === 'complete' ? doneRuns.length : missedRows.length}`) : showAllTimed ? 'Show 3' : `Show all ${list.length}`}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={showAllTimed ? 'is-open' : ''}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      <Sheet open={tileOpen} title={tile ? `Edit ${tile.name}` : 'Add rocket'} onClose={() => setTileOpen(false)}>
        <TileForm
          tile={tile}
          nextSort={p.rockets.length}
          routineId={p.routineId}
          taken={p.rockets.map((l) => l.name)}
          tiles={p.rockets}
          onCancel={() => setTileOpen(false)}
          onSave={async (l, position) => {
            const others = p.rockets.filter((x) => x.id !== l.id);
            const from = p.rockets.findIndex((x) => x.id === l.id);
            if (position === null || position === from) {
              await p.onSaveRocket(l);
            } else {
              others.splice(position, 0, l);
              await p.onSaveRockets(
                others.map((x, i) => ({ ...x, sort: i })).filter((x) => x.id === l.id || p.rockets.find((o) => o.id === x.id)?.sort !== x.sort)
              );
            }
            setTileOpen(false);
          }}
          onDelete={async (id) => {
            await p.onDeleteRocket(id);
            setTileOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={!!runEdit} title="Fix this run" onClose={() => setRunEdit(null)}>
        {runEdit && (
          <form
            className="log-form"
            onSubmit={(e) => {
              e.preventDefault();
              p.onEditRun?.(runEdit.id, { day: runEdit.day, start: runEdit.start, minutes: runEdit.minutes });
              setRunEdit(null);
            }}
          >
            <p className="logask-q">{runEdit.title}</p>
            <div className="time-grid log-form-grid">
              <label className="field">
                <span>Date</span>
                <input type="date" required value={runEdit.day} max={isoDate(p.today)} onChange={(e) => setRunEdit((r) => (r ? { ...r, day: e.target.value || r.day } : r))} />
              </label>
              <label className="field">
                <span>Start time</span>
                <input type="time" required value={runEdit.start} onChange={(e) => setRunEdit((r) => (r ? { ...r, start: e.target.value || r.start } : r))} />
              </label>
              <label className="field">
                <span>Minutes</span>
                <input type="number" required min={1} max={720} value={runEdit.minutes} onChange={(e) => setRunEdit((r) => (r ? { ...r, minutes: Math.min(720, Math.max(1, Number(e.target.value) || 1)) } : r))} />
              </label>
            </div>
            <div className="sheet-actions">
              {p.onUndoRun && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  title="It didn't happen: the run comes off Complete and goes back to Missed (or Active if it's today's)"
                  onClick={() => {
                    p.onUndoRun?.(runEdit.id);
                    setRunEdit(null);
                  }}
                >
                  Not done
                </button>
              )}
              <button type="button" className="btn btn-quiet" onClick={() => setRunEdit(null)}>
                Cancel
              </button>
              <button type="submit" className="btn">
                Save
              </button>
            </div>
          </form>
        )}
      </Sheet>
      <Sheet open={logOpen} title="Add a log" onClose={() => setLogOpen(false)} wide>
        {logOpen && p.onAddLog && (
          <LogForm
            today={p.today}
            projects={p.projects ?? []}
            onCancel={() => setLogOpen(false)}
            onSave={async (x) => {
              await p.onAddLog!(x);
              setLogOpen(false);
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={timedOpen}
        title={timed ? 'Edit timed launch' : 'Add timed launch'}
        onClose={() => {
          setTimedOpen(false);
          setFill(null);
        }}
        wide
      >
        <TimedForm
          // V20-075 (Nov 12): a new form for each launch. Edit from the pop-up swaps the launch while the
          // sheet is already open, and the form kept the old draft (a blank Add form showed instead).
          key={timed ? `edit-${timed.id}` : `add-${fill?.n ?? 'blank'}`}
          launch={timed}
          today={p.today}
          fill={timed ? null : fill?.fill ?? null}
          stepPicks={timed ? undefined : fill?.stepPicks}
          rockets={p.rockets}
          onAddRocket={async (urls) => {
            // V20-350: one rocket holding every new link, named from the first (rename it on the Rockets card).
            if (!urls.length) return;
            await p.onSaveRocket({ id: crypto.randomUUID(), name: nameFromUrl(urls[0]), note: '', url: urls[0], urls, color: 'teal', routineIds: p.routineId ? [p.routineId] : null, sort: p.rockets.length });
          }}
          projects={p.projects ?? []}
          titles={[...new Set(p.launches.map((l) => l.title.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))}
          nextSort={p.launches.length}
          onCancel={() => setTimedOpen(false)}
          onSave={async (l) => {
            // V20-279: only when its timing changed (adding steps isn't a move), and finished blocks don't count.
            const c = isAcked(l) || !timingChanged(timed, l) ? [] : clashesFor(l, p.launches, p.today, settledRuns(p.log ?? []));
            if (c.length) return setClash({ l, with: c });
            // No clash (or already kept): the app's after-save check stays quiet for this one.
            ackClash(l);
            await saveTimed(l);
          }}
          onDelete={async (id) => {
            await p.onDeleteLaunch(id);
            setTimedOpen(false);
          }}
        />
      </Sheet>
      <Sheet open={!!rest} title="The rest of it" onClose={() => setRest(null)}>
        {rest && (() => {
          const today = isoDate(p.today);
          const free = nextOpenSlot({ ...rest, atTime: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` }, today, p.launches);
          const tomorrow = isoDate(new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate() + 1, 12));
          return (
            <div className="clash">
              <p className="logask-q">
                Part logged. When does <b>{rest.title}</b> ({rest.minutes} min) happen?
              </p>
              <div className="sheet-actions clash-acts">
                {free && (
                  <button type="button" className="btn" title={`Next free time: ${hhmm12(Number(free.slice(0, 2)) * 60 + Number(free.slice(3)))}, the first open time from now, today`} onClick={() => void moveRest(rest, { ...rest, atTime: free, onceTime: null, ...(rest.repeat === 'once' ? { onDate: today } : {}) })}>
                    {/* V20-291 (Dan, Nov 17): a button with a time shows just the time. */}
                    {hhmm12(Number(free.slice(0, 2)) * 60 + Number(free.slice(3)))}
                  </button>
                )}
                {rest.repeat === 'once' && (
                  <button type="button" className="btn btn-quiet" title="Tomorrow, same time" onClick={() => void moveRest(rest, { ...rest, onDate: tomorrow, onceTime: null })}>
                    Tomorrow
                  </button>
                )}
                <button type="button" className="btn btn-quiet" title="Opens Edit timed launch to pick a date and time" onClick={() => void moveRest(rest, null)}>
                  Pick a time…
                </button>
                <button type="button" className="btn btn-quiet" title="Leave it where it is (still running if it was)" onClick={() => setRest(null)}>
                  Keep it here
                </button>
              </div>
            </div>
          );
        })()}
      </Sheet>
      <ClashSheet
        clash={clash}
        launches={p.launches}
        onSave={(l) => p.onSaveLaunch(l)}
        onDelete={(id) => p.onDeleteLaunch(id)}
        onClose={(done) => {
          setClash(null);
          if (done) {
            setFill(null);
            setTimedOpen(false);
          }
        }}
      />
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
  tile: Rocket | null;
  nextSort: number;
  routineId: string | null;
  taken: string[];
  tiles: Rocket[];
  onCancel?: () => void;
  /** position: the new place in the routine's tiles (0 = first), or null to leave it. */
  onSave: (l: Rocket, position: number | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Rocket>(
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
  const open = ROCKET_PRESETS.filter((p) => !taken.includes(p.name));
  const beta = useBeta();
  const from = tile ? tiles.findIndex((t) => t.id === tile.id) : -1;
  const [position, setPosition] = useState(from);
  const set = <K extends keyof Rocket>(k: K, v: Rocket[K]) => setD((x) => ({ ...x, [k]: v }));

  // V20-300 (Dan, Nov 17): several links, added like steps (+); old rockets bring their one link.
  const [links0, setLinks] = useState<string[]>(() => rocketUrls(tile ?? { url: '' }));
  const [linkDraft, setLinkDraft] = useState('');
  // V20-301: the links you already have, offered on every line.
  const linkSuggestions = useMemo(() => {
    const out: { url: string; name: string }[] = [];
    for (const t of tiles) for (const u of rocketUrls(t)) if (u && !out.some((o) => o.url === u)) out.push({ url: u, name: t.name });
    const cards = beta ? CARD_LINKS.filter((c) => BETA_CARD_PAGES.includes(c.page)) : CARD_LINKS;
    for (const o of [...ROCKET_PRESETS, ...APP_LINKS, ...cards]) if (o.url && !out.some((x) => x.url === o.url)) out.push({ url: o.url, name: o.name });
    return out;
  }, [tiles, beta]);
  const [hexDraft, setHexDraft] = useState(() => (tile && isHexColor(tile.color) ? tile.color : ''));
  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        // V20-300: every link; the one still being typed counts too.
        const links = [...links0, linkDraft].map(cleanLink).filter((u, i, all) => u && all.indexOf(u) === i);
        await onSave({ ...d, name: d.name.trim(), note: d.note.trim(), url: links[0] ?? '', urls: links, color: hexDraft && isHexColor(hexDraft) ? (hexDraft as TileColor) : d.color }, tile ? position : null);
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
            if (back) {
              setLinks(rocketUrls(back));
              return setD({ ...back, hidden: false });
            }
            setLinks(o.url ? [o.url] : []);
            setD((x) => ({ ...x, name: o.name, note: o.note, url: o.url, color: o.color }));
          }}
          placeholder="New, or pick from the list"
        />
      </label>
      <LinksField links={links0} draft={linkDraft} onDraft={setLinkDraft} onChange={setLinks} suggest={linkSuggestions} />
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
          {/* V20-300 (Dan, Nov 17): just the colours, no names, plus a hex code of your own. */}
          {COLORS.map((c) => (
            <label key={c} className="choice choice-swatch" title={c === 'teal' ? 'Teal' : c === 'purple' ? 'Purple' : c === 'green' ? 'Green' : 'Pink'}>
              <input type="radio" name="tile-color" checked={d.color === c && !isHexColor(hexDraft)} onChange={() => { setHexDraft(''); set('color', c); }} />
              <span className={`swatch-dot tile-${c}`} aria-hidden="true" />
            </label>
          ))}
          <label className="choice choice-hex">
            <span className="swatch-dot" style={{ background: isHexColor(hexDraft) ? hexDraft : 'transparent', border: isHexColor(hexDraft) ? 0 : '2px dashed var(--accent-purple)' }} aria-hidden="true" />
            <input
              value={hexDraft}
              maxLength={7}
              placeholder="#RRGGBB"
              aria-label="Hex code"
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.trim();
                const h = v && !v.startsWith('#') ? `#${v}` : v;
                setHexDraft(h);
                if (isHexColor(h)) set('color', h as TileColor);
              }}
            />
          </label>
        </div>
      </fieldset>
      <label className="choice choice-wide">
        <input type="checkbox" checked={!!d.hidden} onChange={(e) => setD((x) => ({ ...x, hidden: e.target.checked }))} />
        <span title="Keeps it for timed launches and rituals; bring it back from + Add rocket">Hide from list, but save for later</span>
      </label>
      <FormActions formId={formId} saveDisabled={!d.name.trim()} onDelete={tile ? () => onDelete(tile.id) : undefined} deleteLabel={tile?.name} />
    </form>
  );
}

/** The starting list for a timed launch's What; anything typed there joins it once saved. */
// V20-072 (Dan, Nov 12): What is a fixed list, each with its default time allotted, so the data stays clean.
// Later (beta Settings): add, remove and retime these there; these six are the defaults.
// V20-210: the list is the user's (Settings › Projects › What); WHAT_DEFAULTS reads it live.
const WHATS = () => whatList().map((w) => ({ cat: w.name, minutes: w.minutes }));
/** V20-078: an old category name → its What (for new launches filled in from a task, a routine step or a
 *  past run). Anything else: What is left to pick and the whole name becomes the description. */
function whatFor(cat: string): string | null {
  const c = cat.trim().toLowerCase();
  const exact = WHATS().find((w) => w.cat.toLowerCase() === c);
  if (exact) return exact.cat;
  if (/^work block\b/.test(c)) return 'WORK BLOCK';
  if (/^(plan exp|impo|bill pmt)$/.test(c)) return 'BANKING';
  return null;
}

/** "Category - Description" (Nov 2: also " · " and " – ", as some older launches were saved). */
export function splitTitle(t: string) {
  const m = / (-|·|–|—) /.exec(t);
  return !m ? { cat: t.trim(), desc: '' } : { cat: t.slice(0, m.index).trim(), desc: t.slice(m.index + m[0].length).trim() };
}
// V20-180: a description left as just the project's "NAME -" saves without the dangling dash.
export const joinTitle = (c: string, x: string) => {
  const t = x.trim().replace(/\s*[-·–—]$/, '').trim();
  return t ? `${c.trim()} - ${t}` : c.trim();
};
/** The day after the latest date already picked, for + Add another date. */
function nextFree(l: Launch) {
  const all = [l.onDate, ...(l.moreDates ?? [])].filter((x): x is string => !!x).sort();
  const last = all.length ? new Date(`${all[all.length - 1]}T12:00:00`) : new Date();
  last.setDate(last.getDate() + 1);
  return isoDate(last);
}

/** V20-277 (Dan, Nov 16): the steps of a block. Type one, Enter (or +) adds it and the box is ready for the next; × takes one out. */
/** V20-277 / V20-280 (Dan, Nov 16): the steps of a block, one numbered list. The last line is the next step:
 *  type it and it counts (Enter or + just starts the next line); a blank line never saves. × takes one out. */
/** V20-300 (Dan, Nov 17): a rocket's links, added one under another with + (like steps). The one being typed saves too. */
function LinksField({ links, draft, onDraft, onChange, suggest }: { links: string[]; draft: string; onDraft: (v: string) => void; onChange: (v: string[]) => void; suggest: { url: string; name: string }[] }) {
  // V20-301 (Dan, Nov 17): every line suggests the links you already have (pick one or keep typing); plain text
  // fields, so the browser never blocks Save with "Please enter a URL"; each link is cleaned up as it's added.
  const listId = useId();
  const add = () => {
    const x = cleanLink(draft);
    if (!x) return;
    onChange([...links, x]);
    onDraft('');
  };
  return (
    <div className="field steps-field links-field">
      <span>Links</span>
      <ol className="lstep-list">
        {links.map((x, i) => (
          <li key={i}>
            <input type="text" inputMode="url" list={listId} value={x} aria-label={`Link ${i + 1}`} onChange={(e) => onChange(links.map((y, j) => (j === i ? e.target.value : y)))} onBlur={() => (cleanLink(links[i]) ? onChange(links.map((y, j) => (j === i ? cleanLink(y) : y))) : onChange(links.filter((_, j) => j !== i)))} />
            <button type="button" className="quick-btn quick-skip" aria-label={`Remove link ${i + 1}`} title="Remove this link" onClick={() => onChange(links.filter((_, j) => j !== i))}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
        <li>
          <input
            type="text"
            inputMode="url"
            list={listId}
            value={draft}
            placeholder={links.length ? 'Next link' : 'https://www.example.com'}
            aria-label="Next link"
            onChange={(e) => onDraft(e.target.value)}
            onPaste={(e) => {
              // V20-303 (Dan, Nov 17): paste a whole list of links (one per line, or spaces between) and each becomes a line.
              const many = e.clipboardData.getData('text').split(/[\s,]+/).map(cleanLink).filter((u) => u && /[./]/.test(u));
              if (many.length < 2) return;
              e.preventDefault();
              onChange([...links, ...many.filter((u, i) => !links.includes(u) && many.indexOf(u) === i)]);
              onDraft('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="quick-btn quick-skip" aria-label="Add another link" title="Add another link" disabled={!cleanLink(draft)} onClick={add}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </li>
      </ol>
      <datalist id={listId}>
        {suggest.filter((o) => !links.includes(o.url)).map((o) => (
          <option key={o.url} value={o.url} label={o.name} />
        ))}
      </datalist>
    </div>
  );
}

function StepsField({
  steps,
  draft,
  onDraft,
  onChange,
  picks,
  onPick
}: {
  steps: string[];
  draft: string;
  onDraft: (v: string) => void;
  onChange: (v: string[]) => void;
  /** V20-347: the task's open steps, to pick into this launch. */
  picks?: StepPick[];
  onPick?: (x: StepPick) => void;
}) {
  const left = (picks ?? []).filter((x) => !steps.some((s) => s.trim().toLowerCase() === x.name.trim().toLowerCase()));
  const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const add = () => {
    const x = draft.trim();
    if (!x) return;
    onChange([...steps, x]);
    onDraft('');
  };
  const X = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
  return (
    <div className="field steps-field">
      <span>Steps</span>
      {left.length > 0 && onPick && (
        <select
          className="lstep-pick"
          aria-label="Pick a step from the task"
          value=""
          onChange={(e) => {
            const x = left[Number(e.target.value)];
            if (x) onPick(x);
          }}
        >
          <option value="" disabled>
            Pick a step from the task ({left.length})
          </option>
          {left.map((x, i) => (
            <option key={i} value={i}>
              {x.date ? `${x.name} · ${shortDay(x.date)}` : x.name}
            </option>
          ))}
        </select>
      )}
      <ol className="lstep-list">
        {steps.map((x, i) => (
          <li key={i}>
            <input value={x} aria-label={`Step ${i + 1}`} onChange={(e) => onChange(steps.map((y, j) => (j === i ? e.target.value : y)))} onBlur={() => !steps[i].trim() && onChange(steps.filter((_, j) => j !== i))} />
            <button type="button" className="quick-btn quick-skip" aria-label={`Remove step ${x}`} title="Remove this step" onClick={() => onChange(steps.filter((_, j) => j !== i))}>
              {X}
            </button>
          </li>
        ))}
        <li>
          <input
            value={draft}
            placeholder={steps.length ? 'Next step' : 'A step (optional)'}
            aria-label="Next step"
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="quick-btn quick-skip" aria-label="Add another step" title="Add another step" disabled={!draft.trim()} onClick={add}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </li>
      </ol>
    </div>
  );
}

/** V20-314: the next half hour from now ("HH:MM"); 23:30 at the latest. */
function nextHalfHour(now = new Date()) {
  const m = Math.min(23 * 60 + 30, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** V20-314: a one-time launch set for today (or earlier) at a time that's already gone. */
function passedToday(l: Launch, now = new Date()) {
  const today = isoDate(now);
  if (!l.onDate || l.onDate > today) return false;
  if (l.onDate < today) return true;
  const [h, m] = l.atTime.split(':').map(Number);
  // CP-035: this minute counts as now (START NOW), so only earlier minutes have passed.
  return h * 60 + m < now.getHours() * 60 + now.getMinutes();
}

function TimedForm({
  launch,
  today,
  fill,
  stepPicks,
  rockets,
  projects,
  titles,
  nextSort,
  onSave,
  onDelete,
  onAddRocket
}: {
  launch: Launch | null;
  today: Date;
  fill?: Partial<Launch> | null;
  stepPicks?: StepPick[];
  rockets: Rocket[];
  /** Add new rocket: saves a pasted link as a rocket tile. */
  /** V20-350: makes ONE rocket from these links. */
  onAddRocket: (urls: string[]) => Promise<void>;
  projects: { id: string; name: string; parentId: string | null; sort: number; status?: string; shortName?: string }[];
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
        // V20-314 (Dan, Nov 17): a new launch starts at the next half hour, never at a time that's already gone.
        atTime: nextHalfHour(),
        // V20-179 (Nov 13): a new launch is Once, today, by default.
        repeat: 'once',
        weekdays: [1, 2, 3, 4, 5],
        monthDay: 1,
        onDate: todayIso,
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
  const [asRocket, setAsRocket] = useState(false);
  const [pastErr, setPastErr] = useState(false);
  // V20-351 (Dan, Nov 19): STARTED AT: save this new launch at its passed time, on the clock since then.
  const startedThen = useRef(false);
  // What = a category (Work Block #1…, or any you type, which joins the list once saved) and a
  // description. Saved as one title, "Category - Description", so lists read the same (Oct 20).
  // V20-078 (Nov 12): a NEW launch that starts filled in (from a task, a routine step, rocket + in Complete)
  // gets a What from the fixed list, never an old name: a known old name is mapped (Work Block #2 → WORK
  // BLOCK), anything else goes whole into the description with What left to pick. Editing a launch keeps its
  // own name (shown as old until you pick).
  const start = (() => {
    const t = splitTitle(d.title);
    if (launch || !d.title.trim()) return t;
    const w = whatFor(t.cat);
    return w ? { cat: w, desc: t.desc } : { cat: '', desc: d.title.trim() };
  })();
  const [cat, setCat] = useState(start.cat);
  const [stepDraft, setStepDraft] = useState('');
  const [desc, setDesc] = useState(start.desc);
  useEffect(() => {
    if (launch || !d.title.trim()) return;
    const def = WHATS().find((w) => w.cat === start.cat);
    setD((x) => ({
      ...x,
      title: joinTitle(start.cat, start.desc),
      ...(def && fill?.minutes === undefined ? { minutes: def.minutes } : {})
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setWhat = (c: string, x: string) => {
    // Nov 2: a full "What - Description" picked or pasted into What fills both boxes.
    if (!x && / (-|·|–|—) /.test(c)) ({ cat: c, desc: x } = splitTitle(c));
    setCat(c);
    setDesc(x);
    set('title', joinTitle(c, x));
  };
  // Oct 24: one list per kind of work: Work Block #1, #2 and #3 share their descriptions.
  const descriptions = [...new Set(titles.map(splitTitle).filter((t) => launchListFor(t.cat) === launchListFor(cat) && t.desc).map((t) => t.desc))].sort((a, b) => a.localeCompare(b));
  const toggleDay = (i: number) =>
    set('weekdays', d.weekdays.includes(i) ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort());

  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        // V20-314 (Dan, Nov 17): a NEW one-time launch can't be set to a time that's already passed today (it would
        // go straight to Missed / "has passed"). Editing an old one still asks Started then / Log instead.
        const since = startedThen.current;
        startedThen.current = false;
        if (!launch && d.repeat === 'once' && passedToday(d) && !(since && d.onDate === isoDate(new Date()))) {
          setPastErr(true);
          return;
        }
        const more = d.repeat === 'once' ? [...new Set((d.moreDates ?? []).filter((x) => x && x !== d.onDate))].sort() : [];
        // V20-280: the step being typed counts without Enter; blank steps never save.
        const steps = [...(d.steps ?? []), stepDraft].map((x) => x.trim()).filter(Boolean);
        const next = { ...d, steps, active: true, notify: false, title: d.title.trim(), urls: d.urls.filter((u) => u && !isBarePrefix(u)), ...(d.moreDates !== undefined || more.length ? { moreDates: more } : {}) };
        // A repeating launch whose time changed: ask whether it's just the next one or every time.
        if (launch && launch.repeat !== 'once' && launch.repeat !== 'hourly' && d.atTime !== launch.atTime && !scope) {
          setAsk(next);
          return;
        }
        // V20-350 (Dan, Nov 19): "Add (all) as a rocket" ticked: the launch's new links become one rocket on Save.
        if (asRocket) {
          const fresh = next.urls.filter((u) => !rockets.some((r) => rocketUrls(r).includes(u)));
          if (fresh.length) await onAddRocket(fresh);
        }
        await onSave(since && !launch ? { ...next, startedThen: true } : next);
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
      {/* V20-096 (Dan, Nov 12): Project and What side by side at the top, like Project | Task in the task form. */}
      <div className="time-grid">
        {/* V20-074 (Dan, Nov 12): Ritual became Project. A launch's time counts toward its project (Stats: hours
            per project). Sub-projects show under their parent. Existing ritual links keep working. */}
        <label className="field">
          <span>Project</span>
          {/* V20-094 (Dan, Nov 12): every timed launch needs a project (data tracking). */}
          <select
            required
            value={d.projectId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              set('projectId', id);
              // V20-180 (Nov 13): the project's name starts the description ("L4UNCH P4GE - "), and you add the rest.
              // Changing project swaps the old project's name; a description that doesn't start with one is left alone.
              const pre = (pid: string | null | undefined) => {
                const pr = projects.find((x) => x.id === pid);
                return pr ? `${pr.name.toUpperCase()} - ` : '';
              };
              const old = pre(d.projectId);
              const next = pre(id);
              const cur = desc.trim();
              if (!cur) setWhat(cat, next);
              else if (old && (desc.startsWith(old) || cur === old.trim())) setWhat(cat, next + desc.slice(old.length).replace(/^\s+/, ''));
            }}
          >
            <option value="" disabled>
              Pick a project
            </option>
            {projects
              .filter((x) => x.status !== 'archived' || x.id === d.projectId)
              .filter((x) => !x.parentId)
              .sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name))
              .flatMap((top) => [
                top,
                ...projects.filter((c) => c.parentId === top.id && (c.status !== 'archived' || c.id === d.projectId)).sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name))
              ])
              .map((x) => {
                const parent = x.parentId ? projects.find((q) => q.id === x.parentId) : null;
                return (
                  <option key={x.id} value={x.id}>
                    {x.shortName?.trim() || (parent ? `${parent.name} › ${x.name}` : x.name)}
                  </option>
                );
              })}
          </select>
        </label>
        <label className="field">
          <span>What</span>
          <select
            required
            value={cat}
            onChange={(e) => {
              const v = e.target.value;
              setWhat(v, desc);
              const def = WHATS().find((w) => w.cat === v);
              if (def) setD((x) => ({ ...x, minutes: def.minutes, logKind: 'productivity', logAmount: null }));
            }}
          >
            <option value="" disabled>
              Pick what kind of work
            </option>
            {/* V20-210 (Dan, Nov 14): only the picked project's Whats. */}
            {WHATS()
              .filter((w) => projectWhats(d.projectId, projects as { id: string; parentId: string | null; whats?: string[] | null }[]).includes(w.cat))
              .map((w) => (
                <option key={w.cat} value={w.cat}>
                  {w.cat}
                </option>
              ))}
            {cat && !projectWhats(d.projectId, projects as { id: string; parentId: string | null; whats?: string[] | null }[]).includes(cat) && (
              // A launch made before the fixed list keeps its old name until you pick one of the six.
              <option value={cat}>{WHATS().some((w) => w.cat === cat) ? cat : `${cat} (old, pick a new one)`}</option>
            )}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <TitleCombo value={desc} titles={descriptions} required={false} placeholder="L4UNCH P4GE Construction" onChange={(v) => setWhat(cat, v)} list={launchListFor(cat)} />
      </label>
      <StepsField
        steps={d.steps ?? []}
        draft={stepDraft}
        onDraft={setStepDraft}
        onChange={(v) => set('steps', v)}
        picks={stepPicks}
        onPick={(x) => {
          set('steps', [...(d.steps ?? []), x.name]);
          // The Date still on the task's default: it moves to the picked step's date.
          if (x.date && d.repeat === 'once' && d.onDate === (fill?.onDate ?? null)) set('onDate', x.date);
        }}
      />

      <div className="time-grid">
        <label className="field">
          <span>{d.repeat === 'hourly' ? 'From' : 'Time'}</span>
          <input
            type="time"
            required
            value={d.atTime}
            aria-invalid={pastErr && passedToday(d)}
            onChange={(e) => {
              setPastErr(false);
              set('atTime', e.target.value || nextHalfHour());
            }}
          />
          {pastErr && passedToday(d) && (
            // CP-035 (Dan, Nov 18): one line: "[time] has already passed. START NOW" (START NOW = right now).
            <span className="field-error" role="alert">
              {formatMinutes(toMinutes(d.atTime))} has already passed.{' '}
              <button
                type="button"
                className="field-error-action"
                onClick={() => {
                  const n = new Date();
                  setPastErr(false);
                  setD((x) => ({ ...x, onDate: isoDate(n), atTime: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` }));
                }}
              >
                Start now
              </button>
              {d.onDate === isoDate(new Date()) && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="field-error-action"
                    onClick={(e) => {
                      startedThen.current = true;
                      setPastErr(false);
                      e.currentTarget.form?.requestSubmit();
                    }}
                  >
                    Started at {formatMinutes(toMinutes(d.atTime))}
                  </button>
                </>
              )}
            </span>
          )}
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

      {/* V20-076 (Dan, Nov 12): Logs when checked off is gone; What says what kind of time it is. Every What
          logs Productivity; V20-183: the project's Log Productivity switch decides (PERSONAL included). Launches already set to H2O, Food, Vice,
          Activity or Break keep it. */}
      {/* V20-315 (Dan, Nov 17): Rocket · Arcade · Marimba · None (Bell gone, no help text). Launches already on Bell keep it. */}
      <fieldset className="field">
        <legend>Alarm</legend>
        <div className="choice-row tone-row" role="radiogroup" aria-label="Alarm sound">
          {TONES.filter((t) => t.id !== 'bell').map((t) => (
            <label key={t.id} className="choice">
              <input
                type="radio"
                name="tone"
                checked={d.sound && (isTone(d.tone) ? d.tone : 'marimba') === t.id}
                onChange={() => {
                  setD((x) => ({ ...x, sound: true, tone: t.id }));
                  chime('start', t.id);
                }}
              />
              <span>{t.label}</span>
            </label>
          ))}
          <label className="choice">
            <input type="radio" name="tone" checked={!d.sound} onChange={() => set('sound', false)} />
            <span>None</span>
          </label>
        </div>
      </fieldset>

      {/* V20-315 (Dan, Nov 17): Date above Repeats. */}
      {d.repeat === 'once' && (
        <fieldset className="field">
          <legend>Date</legend>
          {/* Once on a few picked dates: + adds another (Oct 20). */}
          <div className="once-dates">
            <div className="once-date">
              <input type="date" value={d.onDate ?? ''} onChange={(e) => set('onDate', e.target.value || null)} aria-label="Date" />
              <button type="button" className="quick-btn quick-skip" aria-label="Add another date" title="Add another date" onClick={() => set('moreDates', [...(d.moreDates ?? []), nextFree(d)])}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            {(d.moreDates ?? []).map((x, i) => (
              <div key={i} className="once-date">
                <input type="date" value={x} onChange={(e) => set('moreDates', (d.moreDates ?? []).map((y, j) => (j === i ? e.target.value : y)))} aria-label={`Date ${i + 2}`} />
                <button type="button" className="quick-btn quick-skip" aria-label={`Remove date ${i + 2}`} title="Remove this date" onClick={() => set('moreDates', (d.moreDates ?? []).filter((_, j) => j !== i))}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="field">
        <legend>Repeats</legend>
        <div className="choice-row">
          {/* V20-299 (Dan, Nov 17): Once sits on the outside (last). */}
          {(['weekly', 'monthly', 'hourly', 'once'] as Repeat[]).map((r) => (
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
        <fieldset className="field">
          <legend>On</legend>
          {/* Nov 2: a date (the 1st) or a weekday (the first Tuesday). */}
          <div className="time-grid">
            <select
              aria-label="Which day of the month"
              value={d.monthWeek ? String(d.monthWeek) : 'date'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'date') setD((x) => ({ ...x, monthWeek: null, monthDay: x.monthDay ?? 1 }));
                else setD((x) => ({ ...x, monthWeek: Number(v), monthDay: null, weekdays: x.weekdays.length ? [x.weekdays[0]] : [2] }));
              }}
            >
              <option value="date">Day of the month</option>
              {MONTH_WEEK.map((w, i) => (
                <option key={w} value={String(i + 1)}>
                  The {w}…
                </option>
              ))}
            </select>
            {d.monthWeek ? (
              <select aria-label="Weekday" value={String(d.weekdays[0] ?? 2)} onChange={(e) => set('weekdays', [Number(e.target.value)])}>
                {DAY_NAMES.map((n, i) => (
                  <option key={n} value={String(i)}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={1}
                max={31}
                aria-label="Day of the month"
                value={d.monthDay ?? 1}
                onChange={(e) => set('monthDay', Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              />
            )}
          </div>
        </fieldset>
      )}
      <fieldset className="field">
        <legend>Rockets to launch</legend>
        <LaunchRocketsField rockets={rockets} picked={d.urls} onChange={(urls) => set('urls', urls)} asRocket={asRocket} onAsRocket={setAsRocket} />
        <p className="field-hint">Apps: the first time, your browser asks to open the app. Tick “Always allow” and it opens straight away after that. More than one link? Your browser may block the extra tabs as pop-ups the first time: choose Always allow for this site.</p>
      </fieldset>

      {/* V20-088: Save waits until What is picked too (the ⊘ cursor instead of the browser's fill-in bubble). */}
      <FormActions formId={formId} saveDisabled={!d.title.trim() || !cat || !d.projectId} onDelete={launch ? () => onDelete(launch.id) : undefined} deleteLabel={launch?.title} />
    </form>
  );
}

/**
 * Oct 24 (LP-045): a dropdown near the bottom of a form or pop-up opens upward when there isn't
 * room below (its list is 280px tall), so every choice can be reached without scrolling.
 */
/** A list near the bottom of the window or a scrolling table opens upward instead of being cut off. */
export function useOpensUp(wrap: { current: HTMLElement | null }, open: boolean) {
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!open || !el) return;
    const r = el.getBoundingClientRect();
    // The visible bottom: the window, or a scrolling box (a pop-up's body) that clips it sooner.
    let bottom = window.innerHeight;
    let top = 0;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') {
        const pr = p.getBoundingClientRect();
        bottom = Math.min(bottom, pr.bottom);
        top = Math.max(top, pr.top);
      }
    }
    const below = bottom - r.bottom;
    const above = r.top - top;
    setUp(below < 290 && above > below);
  }, [open, wrap]);
  return up;
}

/** "What": type a new name, or open the list with ⌄ (or by typing) and pick one you've used before. */
export function TitleCombo({ value, titles: allTitles, onChange, placeholder = 'Work Block #1 - Launch Page Construction', required = true, autoFocus, list, label }: { value: string; titles: string[]; onChange: (v: string) => void; placeholder?: string; required?: boolean; autoFocus?: boolean; /** Oct 24: names the list so its items get an ✕ that hides them (lib/hiddenPicks.ts). */ list?: string; /** Nov 1: the input's accessible name (bank import cells). */ label?: string }) {
  const picks = useContext(HiddenPicksContext);
  const gone = new Set(list ? picks.hidden.filter((h) => h.list === list).map((h) => h.value) : []);
  const titles = gone.size ? allTitles.filter((t) => !gone.has(hiddenKey(t))) : allTitles;
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const up = useOpensUp(wrap, open);
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
        aria-label={label}
        title={label ? value : undefined}
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
        <ul className={`combo-list${up ? ' is-up' : ''}`} role="listbox" id={listId}>
          {shown.map((t, i) => (
            <li key={t} role="option" aria-selected={i === hi} className={list ? 'combo-row' : undefined}>
              <button type="button" className={`combo-opt combo-opt-plain ${i === hi ? 'is-hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(t)}>
                {t}
              </button>
              {list && (
                <button type="button" className="combo-x" aria-label={`Remove ${t} from this list`} title="Remove from this list" onClick={() => picks.hide(list, t)}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
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
export function rocketOptions(tiles: Rocket[], beta = false): RocketOption[] {
  const out: RocketOption[] = [];
  const add = (o: RocketOption) => {
    if (o.url && !out.some((x) => x.url === o.url)) out.push(o);
  };
  for (const t of tiles) add({ name: t.name, note: t.note, url: t.url, color: t.color, kind: 'Rocket' });
  for (const p of ROCKET_PRESETS) add({ name: p.name, note: p.note, url: p.url, color: p.color, kind: 'Original' });
  for (const a of APP_LINKS) add({ name: a.name, note: 'App', url: a.url, color: 'purple', kind: 'App' });
  for (const c of CARD_LINKS) if (!beta || BETA_CARD_PAGES.includes(c.page)) add({ name: c.name, note: 'LaunchPage card', url: c.url, color: 'green', kind: 'Card' });
  return out;
}

/**
 * V20-316 (Dan, Nov 17): Rockets to launch, one field like Steps. Pick one of YOUR rockets (in their order on the
 * page; hidden ones last) or paste a new link, then + for the next. Each line has ×. A pasted link that isn't one
 * of your rockets gets an "Add as a rocket" tick under it. Picking a rocket brings all its links.
 */
function LaunchRocketsField({
  rockets,
  picked,
  onChange,
  asRocket,
  onAsRocket
}: {
  rockets: Rocket[];
  picked: string[];
  onChange: (urls: string[]) => void;
  /** V20-350: one box, beside the last line: ticked, the new links become one rocket when the launch saves. */
  asRocket: boolean;
  onAsRocket: (v: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const mine = [...rockets].sort((a, b) => Number(!!a.hidden) - Number(!!b.hidden) || a.sort - b.sort);
  type Row = { key: string; name: string; urls: string[]; isNew: boolean };
  const rows: Row[] = [];
  const used = new Set<string>();
  for (const x of picked) {
    if (used.has(x)) continue;
    const owner = mine.find((r) => rocketUrls(r).includes(x));
    const all = owner ? rocketUrls(owner) : [];
    if (owner && all.every((u) => picked.includes(u))) {
      all.forEach((u) => used.add(u));
      rows.push({ key: owner.id, name: all.length > 1 ? `${owner.name} · ${all.length} links` : owner.name, urls: all, isNew: false });
    } else {
      used.add(x);
      rows.push({ key: x, name: owner ? `${owner.name} · ${nameFromUrl(x)}` : x, urls: [x], isNew: !owner });
    }
  }
  const newCount = rows.filter((r) => r.isNew).length;
  const options: ComboOption[] = mine
    .filter((r) => rocketUrls(r).length && !rocketUrls(r).every((u) => picked.includes(u)))
    .map((r) => ({ name: r.name, note: r.hidden ? 'Saved for later' : `${rocketUrls(r).length} link${rocketUrls(r).length === 1 ? '' : 's'}`, url: rocketUrls(r)[0], color: r.color, kind: 'Rocket', id: r.id }));
  const addUrls = (urls: string[]) => onChange([...picked, ...urls.filter((u) => !picked.includes(u))]);
  const addTyped = () => {
    const t = q.trim();
    if (!t) return;
    const r = mine.find((x) => x.name.toLowerCase() === t.toLowerCase());
    if (r) addUrls(rocketUrls(r));
    else {
      const u = cleanLink(t);
      if (!u) return;
      addUrls([u]);
    }
    setQ('');
  };
  return (
    <div className="steps-field launch-rockets">
      <ol className="lstep-list">
        {rows.map((r) => (
          <li key={r.key} className="launch-rocket-row">
            <span className="launch-rocket-name" title={r.urls.join('\n')}>
              {r.name}
            </span>
            <button type="button" className="quick-btn quick-skip" aria-label={`Remove ${r.name}`} title="Remove" onClick={() => onChange(picked.filter((u) => !r.urls.includes(u)))}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
        <li className="launch-rocket-next">
          <div
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q.trim()) {
                e.preventDefault();
                addTyped();
              }
            }}
            // V20-348 (Dan, Nov 19): a pasted or typed link goes on the list straight away (no + needed), so
            // "Add as a rocket" shows next to it, and a link left in the box isn't lost on Save.
            onPaste={(e) => {
              const parts = e.clipboardData.getData('text').split(/[\s,]+/).filter(Boolean);
              if (!parts.length || !parts.every(looksLikeLink)) return;
              e.preventDefault();
              addUrls(parts.map(cleanLink).filter(Boolean));
              setQ('');
            }}
            onBlur={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              if (looksLikeLink(q.trim())) addTyped();
            }}
          >
            <NameCombo
              value={q}
              options={options}
              required={false}
              maxLength={2000}
              onType={setQ}
              onPick={(o) => {
                const r = mine.find((x) => x.id === o.id);
                if (r) addUrls(rocketUrls(r));
                setQ('');
              }}
              placeholder={rows.length ? 'Next rocket or link' : 'Pick a rocket, or paste a link'}
            />
          </div>
          <button type="button" className="quick-btn quick-skip" aria-label="Add" title="Add" disabled={!q.trim()} onClick={addTyped}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <label className="check-line launch-rocket-add" title="Makes one rocket from this launch's new links when you save">
            <input type="checkbox" checked={asRocket} onChange={(e) => onAsRocket(e.target.checked)} />
            <span>{newCount > 1 ? `Add all as a rocket (${newCount})` : 'Add as a rocket'}</span>
          </label>
        </li>
      </ol>
    </div>
  );
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
function NameCombo({ value, options, onType, onPick, placeholder, required = true, maxLength = NAME_MAX }: { value: string; options: ComboOption[]; onType: (v: string) => void; onPick: (o: ComboOption) => void; placeholder: string; required?: boolean; maxLength?: number }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const up = useOpensUp(wrap, open);
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
        maxLength={maxLength}
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
        <ul className={`combo-list${up ? ' is-up' : ''}`} role="listbox" id={listId}>
          {shown.map((o, i) => (
            <li key={`${o.kind}-${o.name}`} role="option" aria-selected={i === hi}>
              <button type="button" className={`combo-opt ${i === hi ? 'is-hi' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
                <span className={`combo-dot ${tileClass(o.color)}`} style={tileStyle(o.color)} aria-hidden="true" />
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

/**
 * V20-216 (Dan, Nov 14): Add a log, from Stats › +. Work done with no launch behind it (errands for the
 * project, a sketch on a napkin): Project, What, Description, Date, Start time, Minutes. Nothing is logged
 * without a time. Saved as a done run with no launch: it counts in hours, never in the Done rate.
 */
function LogForm({
  today,
  projects,
  onCancel,
  onSave
}: {
  today: Date;
  projects: { id: string; name: string; parentId: string | null; sort: number; status?: string; shortName?: string; whats?: string[] | null }[];
  onCancel: () => void;
  onSave: (x: { title: string; projectId: string | null; day: string; start: string; minutes: number }) => Promise<void>;
}) {
  const n = new Date();
  const back = new Date(n.getTime() - 60 * 60_000);
  const [projectId, setProjectId] = useState('');
  const [cat, setCat] = useState('');
  const [desc, setDesc] = useState('');
  const [day, setDay] = useState(isoDate(today));
  const [start, setStart] = useState(`${String(back.getHours()).padStart(2, '0')}:${String(Math.floor(back.getMinutes() / 5) * 5).padStart(2, '0')}`);
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const proj = projects.find((x) => x.id === projectId);
  const whats = WHATS().filter((w) => projectWhats(projectId || null, projects).includes(w.cat));
  const ordered = projects
    .filter((x) => x.status !== 'archived' && !x.parentId)
    .sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name))
    .flatMap((top) => [top, ...projects.filter((c) => c.parentId === top.id && c.status !== 'archived').sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name))]);
  return (
    <form
      className="log-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!cat || !desc.trim() || !(minutes > 0)) return;
        const name = proj ? (proj.shortName?.trim() || proj.name).toUpperCase() : '';
        const title = joinTitle(cat, [name, desc.trim()].filter(Boolean).join(' - '));
        setBusy(true);
        try {
          await onSave({ title, projectId: projectId || null, day, start, minutes });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="time-grid">
        <label className="field">
          <span>Project</span>
          <select required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="" disabled>
              Pick a project
            </option>
            {ordered.map((x) => {
              const parent = x.parentId ? projects.find((q) => q.id === x.parentId) : null;
              return (
                <option key={x.id} value={x.id}>
                  {x.shortName?.trim() || (parent ? `${parent.name} › ${x.name}` : x.name)}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span>What</span>
          <select
            required
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
            }}
          >
            <option value="" disabled>
              Pick what kind of work
            </option>
            {whats.map((w) => (
              <option key={w.cat} value={w.cat}>
                {w.cat}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <input required value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Errands for the launch, napkin sketch of a feature" />
      </label>
      <div className="time-grid log-form-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" required value={day} max={isoDate(today)} onChange={(e) => setDay(e.target.value || isoDate(today))} />
        </label>
        <label className="field">
          <span>Start time</span>
          <input type="time" required value={start} onChange={(e) => setStart(e.target.value || start)} />
        </label>
        <label className="field">
          <span>Minutes</span>
          <input type="number" required min={1} max={720} value={minutes} onChange={(e) => setMinutes(Math.min(720, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
      </div>
      <p className="field-hint">Work done with no launch. Counts in your hours and Productivity (if the project logs it), not in Launches done.</p>
      <div className="sheet-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={busy || !cat}>
          Log
        </button>
      </div>
    </form>
  );
}
