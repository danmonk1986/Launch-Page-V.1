/**
 * 26 Days: the habit and accountability engine.
 *
 * Mode comes from the routine picker (HQ, or MWD on Days or Nights). Every MWD Nights time
 * flips 12 hours. "Today" is the routine day: 4 AM to 4 AM, or 4 PM to 4 PM on nights.
 * A day is ON BASELINE with at most one Non-Negotiable missed (Oct 29: 11 of 12, 7 of 8, 5 of 6).
 * All of them ticked is a FULL day. Vices are logged honestly
 * and tracked on their own; a celebration day you still showed up for isn't a wash.
 * The log is the proof: loggable Non-Negotiables tick only from logs.
 */
import { makeStore } from './store';

/** V12-041: a day stays on baseline with this many Non-Negotiables missed (11 of 12, 7 of 8). */
export const ALLOWED_MISSES = 1;
/** On baseline: something ticked and no more than ALLOWED_MISSES left. */
export const onBaseline = (done: number, total: number) => total > 0 && done > 0 && total - done <= ALLOWED_MISSES;
import { formatMinutes, shiftMinutes, type Routine, type Shift } from './routines';

export type Mode = 'HQ' | 'MWD';
export type Section = 'morning' | 'midday' | 'evening';
export type LogKind = 'productivity' | 'activity' | 'rest' | 'food' | 'h2o' | 'vices';

export const SECTIONS: { id: Section; label: string; checkIn: string }[] = [
  { id: 'morning', label: 'Morning', checkIn: '09:00' },
  { id: 'midday', label: 'Midday', checkIn: '13:00' },
  { id: 'evening', label: 'Evening', checkIn: '18:00' }
];

/** One Non-Negotiable. Times are written for Days; MWD Nights flips them. */
export interface NonNeg {
  id: string;
  label: string;
  section: Section;
  time: string | null;
  /** Wake Up and Bed follow the active routine's wake and bed times. */
  timeFrom: 'wake' | 'bed' | null;
  /** Ticks only from the log of this kind. */
  log: 'productivity' | 'activity' | null;
  /** Blocks (productivity) or minutes (activity) needed in a day. */
  target: number;
  /** Activity: days a week to aim for (shown, not scored). */
  perWeek: number | null;
  /** Removed items stay for history, hidden from today. */
  archived: boolean;
  sort: number;
}

/** What the day's list looked like, so editing the list never rewrites history. */
export interface SnapItem {
  id: string;
  label: string;
  log: NonNeg['log'];
  target: number;
}

export interface DayRecord {
  id: string;
  day: string; // routine day, YYYY-MM-DD
  mode: Mode;
  shift: Shift;
  /** Non-Negotiables ticked by hand (loggable ones never go here). */
  ticks: string[];
  items: SnapItem[];
  sort: number;
}

export interface LogEntry {
  id: string;
  day: string;
  at: string; // ISO
  kind: LogKind;
  /** Per one: blocks, minutes, steps, hours, kcal, ml, or a vice's weight. */
  amount: number;
  /** × quantity. */
  qty: number;
  unit: string;
  note: string;
  mode: Mode;
  sort: number;
}

export interface Quote {
  id: string;
  text: string;
  author: string;
  sort: number;
}

export interface Config {
  id: string;
  viceLimitHQ: number;
  viceLimitMWD: number;
  /** A vice note's weight, remembered (lower-case note → weight). */
  viceWeights: Record<string, number>;
  sort: number;
}

export const CONFIG_ID = 'd2600000-0000-4000-8000-000000000000';
export const DEFAULT_CONFIG: Config = { id: CONFIG_ID, viceLimitHQ: 3, viceLimitMWD: 2, viceWeights: {}, sort: 0 };

export const VICE_WEIGHTS = [
  { label: 'Light', weight: 0.5 },
  { label: 'Medium', weight: 1 },
  { label: 'Heavy', weight: 3 }
];
export const H2O_SIZES = [
  { label: 'Glass', ml: 500 },
  { label: 'Bottle', ml: 750 }
];
/** Steps count toward activity minutes at a walking pace. */
export const STEPS_PER_MIN = 100;

// ---------- Mode and the routine day ----------

/** HQ unless the routine is a flipping (shift) routine or is named MWD. */
export function modeOf(r: Routine | null): Mode {
  if (!r) return 'HQ';
  return r.flips || /\bmwd\b/i.test(r.name) ? 'MWD' : 'HQ';
}

/** Times flip only at MWD on Nights. */
export const flipsNow = (mode: Mode, shift: Shift) => mode === 'MWD' && shift === 'nights';
export const effShift = (mode: Mode, shift: Shift): Shift => (mode === 'MWD' ? shift : 'days');

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * When the day resets, in minutes after midnight: the routine's Bed time (flipped on Nights).
 * A routine without a bed time resets at 4 AM, or 4 PM on nights.
 */
export function resetMinutes(r: Routine | null, shift: Shift, flip: boolean) {
  return r?.bed ? shiftMinutes(r.bed, shift, r.flips) : flip ? 16 * 60 : 4 * 60;
}

/**
 * The routine day: from one bed time to the next. It's named for the date you wake up into,
 * so a night shift that runs past midnight stays on the day it started.
 */
export function routineDay(now: Date, r: Routine | null, shift: Shift, flip: boolean) {
  const reset = resetMinutes(r, shift, flip);
  const since = (now.getHours() * 60 + now.getMinutes() - reset + 1440) % 1440;
  const lastReset = now.getTime() - since * 60_000;
  const wake = r?.wake ? shiftMinutes(r.wake, shift, r.flips) : reset;
  return iso(new Date(lastReset + ((wake - reset + 1440) % 1440) * 60_000));
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** The section you're in: each runs up to its check-in, counted from the reset. */
export function currentSection(now: Date, reset: number, flip: boolean): Section {
  const since = (min: number) => (min - reset + 1440) % 1440;
  const n = since(now.getHours() * 60 + now.getMinutes());
  for (const s of SECTIONS) if (n < since(shiftMinutes(s.checkIn, flip ? 'nights' : 'days', true))) return s.id;
  return 'evening';
}

export const checkInTime = (s: Section, flip: boolean) =>
  formatMinutes(shiftMinutes(SECTIONS.find((x) => x.id === s)!.checkIn, flip ? 'nights' : 'days', true));

/** An item's time as shown today, or null. */
export function itemTime(n: NonNeg, routine: Routine | null, shift: Shift, flip: boolean): string | null {
  if (n.timeFrom) {
    const t = n.timeFrom === 'wake' ? routine?.wake : routine?.bed;
    return t ? formatMinutes(shiftMinutes(t, shift, !!routine?.flips)) : null;
  }
  return n.time ? formatMinutes(shiftMinutes(n.time, flip ? 'nights' : 'days', true)) : null;
}

// ---------- Defaults ----------

export function seedNonNegs(): NonNeg[] {
  const id = () => crypto.randomUUID();
  const base = { time: null, timeFrom: null, log: null, target: 0, perWeek: null, archived: false } as const;
  const list: Omit<NonNeg, 'sort'>[] = [
    { ...base, id: id(), label: 'Wake Up', section: 'morning', timeFrom: 'wake' },
    { ...base, id: id(), label: 'Rise to Shine Ritual', section: 'morning' },
    { ...base, id: id(), label: 'Power Up', section: 'morning' },
    { ...base, id: id(), label: 'Water Before Coffee', section: 'morning' },
    { ...base, id: id(), label: '1 Productivity Block', section: 'midday', time: '09:30', log: 'productivity', target: 1 },
    { ...base, id: id(), label: 'Activity 3 × 10', section: 'midday', log: 'activity', target: 30, perWeek: 4 },
    { ...base, id: id(), label: 'Water + Pills', section: 'evening', time: '19:30' },
    { ...base, id: id(), label: 'Power Down', section: 'evening' },
    { ...base, id: id(), label: 'Gratitude Ritual', section: 'evening' },
    { ...base, id: id(), label: 'Bed', section: 'evening', timeFrom: 'bed' }
  ];
  return list.map((n, i) => ({ ...n, sort: i }));
}

export const activeNonNegs = (list: NonNeg[]) =>
  list.filter((n) => !n.archived).sort((a, b) => a.sort - b.sort);

export const snapshot = (list: NonNeg[]): SnapItem[] =>
  activeNonNegs(list).map((n) => ({ id: n.id, label: n.label, log: n.log, target: n.target }));

/** One record per user per day, so two devices never make two. */
export function dayId(day: string) {
  return `d2600000-0000-4000-8000-${day.replace(/-/g, '')}0000`;
}

// ---------- Totals ----------

export const total = (e: LogEntry) => e.amount * e.qty;

export function logsOn(logs: LogEntry[], day: string, kind?: LogKind) {
  return logs.filter((l) => l.day === day && (!kind || l.kind === kind));
}

export const sum = (list: LogEntry[]) => list.reduce((a, e) => a + total(e), 0);

/** Activity minutes, with steps counted at a walking pace. */
export const activityMinutes = (list: LogEntry[]) =>
  list.reduce((a, e) => a + (e.unit === 'steps' ? total(e) / STEPS_PER_MIN : total(e)), 0);

/** How much of a loggable item is logged on a day. */
export function loggedFor(item: { log: NonNeg['log'] }, logs: LogEntry[], day: string) {
  if (item.log === 'productivity') return sum(logsOn(logs, day, 'productivity'));
  if (item.log === 'activity') return activityMinutes(logsOn(logs, day, 'activity'));
  return 0;
}

export function isDone(item: SnapItem, rec: DayRecord | null, logs: LogEntry[], day: string) {
  if (item.log) return loggedFor(item, logs, day) >= (item.target || 1);
  return !!rec?.ticks.includes(item.id);
}

export const viceLimit = (c: Config, m: Mode) => (m === 'HQ' ? c.viceLimitHQ : c.viceLimitMWD);

export interface DayResult {
  day: string;
  mode: Mode;
  shift: Shift;
  done: number;
  total: number;
  pct: number;
  vice: number;
  limit: number;
  on: boolean;
  /** Every Non-Negotiable ticked. */
  full: boolean;
  blocks: number;
  activity: number;
}

export function scoreDay(rec: DayRecord, logs: LogEntry[], c: Config): DayResult {
  const items = rec.items;
  const done = items.filter((i) => isDone(i, rec, logs, rec.day)).length;
  const pct = items.length ? done / items.length : 0;
  const vice = sum(logsOn(logs, rec.day, 'vices'));
  const limit = viceLimit(c, rec.mode);
  return {
    day: rec.day,
    mode: rec.mode,
    shift: rec.shift,
    done,
    total: items.length,
    pct,
    vice,
    limit,
    on: onBaseline(done, items.length),
    full: items.length > 0 && done === items.length,
    blocks: sum(logsOn(logs, rec.day, 'productivity')),
    activity: activityMinutes(logsOn(logs, rec.day, 'activity'))
  };
}

/** Finished days (before today), newest first, within `days` back (null = all). */
export function finished(records: DayRecord[], logs: LogEntry[], c: Config, today: string, days: number | null) {
  const from = days ? addDays(today, -days) : '';
  return records
    .filter((r) => r.day < today && r.day >= from && r.items.length)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .map((r) => scoreDay(r, logs, c));
}

/**
 * V12-045 · logging streak: days in a row with at least one log of any kind (did you show up).
 * Today counts once it has a log; until then the streak runs to yesterday, so it isn't broken yet.
 */
export function loggingStreak(logs: LogEntry[], today: string): number {
  const days = new Set(logs.map((l) => l.day));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/** The run you're on: days on baseline in a row, or days in a dip. */
export function currentRun(results: DayResult[]) {
  if (!results.length) return { on: true, n: 0 };
  const on = results[0].on;
  let n = 0;
  for (const r of results) {
    if (r.on !== on) break;
    n += 1;
  }
  return { on, n };
}

/** Average days a dip lasted before getting back on baseline; null if none recovered yet. */
export function bounceBack(results: DayResult[]) {
  const asc = [...results].reverse();
  const lengths: number[] = [];
  let dip = 0;
  for (const r of asc) {
    if (!r.on) dip += 1;
    else if (dip) {
      lengths.push(dip);
      dip = 0;
    }
  }
  if (!lengths.length) return null;
  return lengths.reduce((a, b) => a + b, 0) / lengths.length;
}

export interface ModeRow {
  label: string;
  days: number;
  onPct: number | null;
  nonNegPct: number | null;
  vice: number | null;
  blocks: number | null;
  activityDays: number | null;
}

export function modeRow(label: string, rs: DayResult[]): ModeRow {
  const n = rs.length;
  const avg = (f: (r: DayResult) => number) => (n ? rs.reduce((a, r) => a + f(r), 0) / n : null);
  return {
    label,
    days: n,
    onPct: avg((r) => (r.on ? 1 : 0)),
    nonNegPct: avg((r) => r.pct),
    vice: avg((r) => r.vice),
    blocks: avg((r) => r.blocks),
    activityDays: n ? rs.filter((r) => r.activity >= 30).length : null
  };
}

/** A plain-words takeaway once both modes have 3 finished days. */
export function takeaway(hq: ModeRow, mwd: ModeRow): string | null {
  if (hq.days < 3 || mwd.days < 3) return null;
  const pct = (x: number | null) => `${Math.round((x ?? 0) * 100)}%`;
  const better = (hq.onPct ?? 0) === (mwd.onPct ?? 0) ? null : (hq.onPct ?? 0) > (mwd.onPct ?? 0) ? 'HQ' : 'MWD';
  const head = better
    ? `${better} hits baseline more often (${pct(better === 'HQ' ? hq.onPct : mwd.onPct)} vs ${pct(better === 'HQ' ? mwd.onPct : hq.onPct)}).`
    : `HQ and MWD hit baseline equally often (${pct(hq.onPct)}).`;
  // Where Work Dan does better, by the biggest relative gap: that's what to bring home.
  const gaps = [
    { name: 'Non-Negotiables', a: mwd.nonNegPct ?? 0, b: hq.nonNegPct ?? 0, fmt: pct, higher: true },
    { name: 'blocks a day', a: mwd.blocks ?? 0, b: hq.blocks ?? 0, fmt: (x: number | null) => (x ?? 0).toFixed(1), higher: true },
    { name: 'vice load a day', a: mwd.vice ?? 0, b: hq.vice ?? 0, fmt: (x: number | null) => (x ?? 0).toFixed(1), higher: false }
  ]
    .map((g) => ({ ...g, gap: (g.higher ? g.a - g.b : g.b - g.a) / Math.max(g.a, g.b, 0.0001) }))
    .filter((g) => g.gap > 0.1)
    .sort((x, y) => y.gap - x.gap);
  if (!gaps.length) return `${head} Nothing MWD does clearly better yet: HQ is holding its own.`;
  const g = gaps[0];
  return `${head} MWD wins on ${g.name} (${g.fmt(g.a)} vs ${g.fmt(g.b)} at HQ): that's the one to bring home.`;
}

// ---------- Storage ----------

type NonNegRow = {
  id: string;
  label: string;
  section: Section;
  at_time: string | null;
  time_from: 'wake' | 'bed' | null;
  log_kind: NonNeg['log'];
  target: number;
  per_week: number | null;
  archived: boolean;
  sort: number;
};

export const nonNegStore = makeStore<NonNeg, NonNegRow>({
  table: 'd26_nonnegs',
  localKey: 'launchpage.d26.nonnegs.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0018_26_days.sql',
  seed: seedNonNegs,
  toRow: (n) => ({
    id: n.id,
    label: n.label,
    section: n.section,
    at_time: n.time,
    time_from: n.timeFrom,
    log_kind: n.log,
    target: n.target,
    per_week: n.perWeek,
    archived: n.archived,
    sort: n.sort
  }),
  fromRow: (r) => ({
    id: r.id,
    label: r.label,
    section: r.section,
    time: r.at_time,
    timeFrom: r.time_from,
    log: r.log_kind,
    target: Number(r.target) || 0,
    perWeek: r.per_week,
    archived: !!r.archived,
    sort: r.sort
  })
});

type DayRow = { id: string; day: string; mode: Mode; shift: Shift; ticks: string[]; items: SnapItem[]; sort: number };

export const dayStore = makeStore<DayRecord, DayRow>({
  table: 'd26_days',
  localKey: 'launchpage.d26.days.v1',
  orderBy: 'day',
  script: 'supabase/migrations/0018_26_days.sql',
  seed: () => [],
  toRow: (d) => ({ id: d.id, day: d.day, mode: d.mode, shift: d.shift, ticks: d.ticks, items: d.items, sort: d.sort }),
  fromRow: (r) => ({
    id: r.id,
    day: r.day,
    mode: r.mode,
    shift: r.shift,
    ticks: Array.isArray(r.ticks) ? r.ticks : [],
    items: Array.isArray(r.items) ? r.items : [],
    sort: r.sort
  })
});

type LogRow = { id: string; day: string; at: string; kind: LogKind; amount: number; qty: number; unit: string; note: string; mode: Mode; sort: number };

export const logStore = makeStore<LogEntry, LogRow>({
  table: 'd26_logs',
  localKey: 'launchpage.d26.logs.v1',
  orderBy: 'at',
  script: 'supabase/migrations/0018_26_days.sql',
  seed: () => [],
  toRow: (l) => ({ id: l.id, day: l.day, at: l.at, kind: l.kind, amount: l.amount, qty: l.qty, unit: l.unit, note: l.note, mode: l.mode, sort: l.sort }),
  fromRow: (r) => ({ ...r, amount: Number(r.amount) || 0, qty: Number(r.qty) || 1, note: r.note ?? '' })
});

type QuoteRow = { id: string; body: string; author: string; sort: number };

export const quoteStore = makeStore<Quote, QuoteRow>({
  table: 'd26_quotes',
  localKey: 'launchpage.d26.quotes.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0018_26_days.sql',
  seed: () => [],
  toRow: (q) => ({ id: q.id, body: q.text, author: q.author, sort: q.sort }),
  fromRow: (r) => ({ id: r.id, text: r.body, author: r.author ?? '', sort: r.sort })
});

type ConfigRow = { id: string; vice_limit_hq: number; vice_limit_mwd: number; vice_weights: Record<string, number>; sort: number };

export const configStore = makeStore<Config, ConfigRow>({
  table: 'd26_config',
  localKey: 'launchpage.d26.config.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0018_26_days.sql',
  seed: () => [DEFAULT_CONFIG],
  toRow: (c) => ({ id: c.id, vice_limit_hq: c.viceLimitHQ, vice_limit_mwd: c.viceLimitMWD, vice_weights: c.viceWeights, sort: 0 }),
  fromRow: (r) => ({
    id: r.id,
    viceLimitHQ: Number(r.vice_limit_hq),
    viceLimitMWD: Number(r.vice_limit_mwd),
    viceWeights: r.vice_weights && typeof r.vice_weights === 'object' ? r.vice_weights : {},
    sort: 0
  })
});

// ---------- Which quote is showing (per device) ----------

const QUOTE_KEY = 'launchpage.d26.quoteShown';
export function readShownQuote(): string | null {
  try {
    return localStorage.getItem(QUOTE_KEY);
  } catch {
    return null;
  }
}
export function writeShownQuote(id: string) {
  try {
    localStorage.setItem(QUOTE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** A different quote from the one showing. */
export function shuffleFrom(list: Quote[], current: string | null) {
  const others = list.filter((q) => q.id !== current);
  if (!others.length) return current;
  return others[Math.floor(Math.random() * others.length)].id;
}

// ---------- Rituals ----------

/** A ritual step's tick for today lives in the day record as "r:<ritual>:<step>". */
export const ritualKey = (ritualId: string, i: number) => `r:${ritualId}:${i}`;
/** A List step's picks for today (Oct 24: pick as many as you like), "r:<ritual>:<step>:pick:<choice>". */
export const pickKey = (ritualId: string, i: number, choice: string) => `${ritualKey(ritualId, i)}:pick:${choice}`;

// ---------- Which log a step opens ----------

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** A step that is really a log, read from its name: H2O / water, a meal, moving, working. */
export function logKindFor(label: string): { kind: LogKind; fill: Partial<LogEntry> } | null {
  const l = label.trim().toLowerCase();
  // Oct 24: "H20" with a zero counts too.
  if (/\bh2o\b|\bh20\b|\bwater\b/.test(l)) return { kind: 'h2o', fill: {} };
  const meal = MEALS.find((m) => new RegExp(`\\b${m.toLowerCase()}\\b`).test(l));
  if (meal) return { kind: 'food', fill: { note: meal } };
  // Oct 24: moving and working steps log too (Walk → Activity, Leisure work → Productivity).
  if (/\b(walk|run(?!\s+errands)|jog|hike|workout|gym|yoga|stretch|exercise|bike|swim|activity)\b/.test(l)) return { kind: 'activity', fill: { note: label.trim() } };
  if (/\b(work|work block|productivity)\b/.test(l)) return { kind: 'productivity', fill: { note: label.trim() } };
  return null;
}

/** A ritual step's (or a list choice's) log: picked in Edit ritual, or read from its name for older steps. */
export type StepLog = LogKind | 'none';
export function logFor(label: string, set?: StepLog): { kind: LogKind; fill: Partial<LogEntry> } | null {
  if (set === 'none') return null;
  const guess = logKindFor(label);
  if (!set) return guess;
  if (guess && guess.kind === set) return guess;
  return { kind: set, fill: set === 'h2o' ? {} : { note: label.trim() } };
}

/** The Non-Negotiable a ritual stands for: same name, or a name that contains it ("Rise to Shine Ritual"). */
export function nonNegForRitual(list: NonNeg[], r: { id: string; name: string }) {
  const name = r.name.trim().toLowerCase();
  if (!name) return null;
  return activeNonNegs(list).find((n) => !n.log && (n.label.trim().toLowerCase() === name || n.label.toLowerCase().includes(name))) ?? null;
}

/** The ritual shown on the Rituals card, per device. */
const RITUAL_KEY = 'launchpage.d26.ritualShown';
export function readShownRitual(): string | null {
  try {
    return localStorage.getItem(RITUAL_KEY);
  } catch {
    return null;
  }
}
export function writeShownRitual(id: string) {
  try {
    localStorage.setItem(RITUAL_KEY, id);
  } catch {
    /* ignore */
  }
}
