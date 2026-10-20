import { isTone, type Tone } from './alerts';
import { makeStore } from './store';
import { toMinutes } from './routines';

export type TileColor = 'teal' | 'purple' | 'green' | 'pink';

export interface Launcher {
  id: string;
  name: string;
  note: string;
  url: string;
  color: TileColor;
  /** null = every routine. Linking tiles to routines comes later. */
  routineIds: string[] | null;
  sort: number;
  /** Off the Launch Page but kept: still in every rocket list (timed launches, rituals). Column from 0028. */
  hidden?: boolean;
}

export type Repeat = 'weekly' | 'monthly' | 'once' | 'hourly';

/** What checking off a timed launch logs in 26 Days. */
export type LaunchLogKind = 'productivity' | 'activity' | 'rest' | 'food' | 'h2o' | 'vices';

/** A timed launch: at its time a reminder pops up and one tap opens every tab. */
export interface Launch {
  id: string;
  title: string;
  atTime: string; // "HH:MM"
  repeat: Repeat;
  weekdays: number[]; // 0 = Sunday
  monthDay: number | null;
  onDate: string | null; // "YYYY-MM-DD"
  /** Once: more picked dates, not a pattern (Oct 21 / Oct 22 / Oct 23). Column from 0024. */
  moreDates?: string[];
  minutes: number;
  urls: string[];
  active: boolean;
  /** A one-time make-up date, set when a repeating launch is skipped. */
  movedTo: string | null;
  /** Chime at the start and when the time allotted runs out. */
  sound: boolean;
  /** Desktop notification at the start and the end (retired from the form Oct 16). */
  notify: boolean;
  /** Which alarm sound plays. */
  tone?: Tone;
  /** A different time for one date only ("just this one"). */
  onceTime?: { date: string; atTime: string } | null;
  /** LAUNCH opens this ritual to work through (26 Days). */
  ritualId?: string | null;
  /**
   * What it logs when checked off. Unset: launches that open something log Productivity
   * by time spent; launches with nothing to open log nothing.
   */
  logKind?: LaunchLogKind | null;
  /** The fixed amount for H2O (ml), Food (kcal) and Vices (weight). Activity and Rest use the minutes. */
  logAmount?: number | null;
  /** Hourly: the last hour it pops up ("HH:MM"); from atTime to this, every hour. */
  untilTime?: string | null;
  sort: number;
}

/** The launch's time on a given day: its one-day change if there is one. */
export function timeFor(l: Launch, day: Date) {
  if (l.repeat === 'hourly') return hhmm(slotStart(l, day));
  return l.onceTime && l.onceTime.date === isoDate(launchDate(l, day)) ? l.onceTime.atTime : l.atTime;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Hourly: the hours it pops up, as minutes after midnight, from atTime to untilTime (can run past midnight). */
function hourlySlots(l: Launch): number[] {
  const from = toMinutes(l.atTime);
  const to = toMinutes(l.untilTime || l.atTime);
  const span = (to - from + 1440) % 1440;
  const out: number[] = [];
  for (let m = 0; m <= span; m += 60) out.push((from + m) % 1440);
  return out;
}

/**
 * Hourly: the slot happening now (the latest one that has started, within the last day),
 * or the next one if none has. Other repeats: today at its time.
 */
export function slotStart(l: Launch, now: Date): Date {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let best: Date | null = null;
  let bestAgo = Infinity;
  for (const m of hourlySlots(l)) {
    const ago = (nowMin - m + 1440) % 1440;
    if (ago < bestAgo) {
      bestAgo = ago;
      best = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(m / 60), m % 60);
      if (m > nowMin) best.setDate(best.getDate() - 1);
    }
  }
  return best ?? now;
}

/** Hourly launches are handled per hour; everything else once a day. */
export function runKey(l: Launch, now: Date) {
  if (l.repeat !== 'hourly') return `${l.id}:${isoDate(launchDate(l, now))}`;
  const s = slotStart(l, now);
  return `${l.id}:${isoDate(s)}@${hhmm(s)}`;
}

export const LOG_KINDS: { kind: LaunchLogKind; label: string }[] = [
  { kind: 'productivity', label: 'Productivity' },
  { kind: 'activity', label: 'Activity' },
  { kind: 'rest', label: 'Rest (break)' },
  { kind: 'food', label: 'Food' },
  { kind: 'h2o', label: 'H2O' },
  { kind: 'vices', label: 'Vice' }
];

/** "Activity · 10 min", "H2O · Glass" */
export function describeLog(l: Launch) {
  switch (l.logKind) {
    case 'productivity':
      return opensSomething(l) ? 'Productivity · time spent' : `Productivity · ${Math.round((l.minutes / 90) * 4) / 4} blocks`;
    case 'activity':
      return `Activity · ${l.minutes} min`;
    case 'rest':
      return `Break · ${l.minutes} min`;
    case 'food':
      return `Food · ${l.logAmount ?? 0} kcal`;
    case 'h2o':
      return `H2O · ${(l.logAmount ?? 500) === 750 ? 'Bottle' : (l.logAmount ?? 500) === 500 ? 'Glass' : `${l.logAmount} ml`}`;
    case 'vices':
      return `Vice · ${l.logAmount ?? 1}`;
    default:
      return 'nothing';
  }
}

/** Opens tabs, apps or a ritual. Launches that don't just remind (and log). */
export const opensSomething = (l: Launch) => l.urls.length > 0 || !!l.ritualId;

/** The next date a launch happens, from today (looks up to two months ahead). */
export function nextDate(l: Launch, from: Date): string | null {
  for (let i = 0; i < 62; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12);
    if (happensOn(l, d)) return isoDate(d);
  }
  return null;
}

const LAUNCH_SHEET = 'https://docs.google.com/spreadsheets/d/1rH_8_qYR592YNtbU0oEeByxpmkLm6R4bgVltUr8KABw/edit';

/** The eight tiles from the LAUNCH PAGE tab of the Launch Sheet. */
export interface LauncherPreset {
  name: string;
  note: string;
  url: string;
  color: TileColor;
}

/** The eight tiles from the LAUNCH PAGE tab of the Launch Sheet, offered under + Add launch. */
export const LAUNCHER_PRESETS: LauncherPreset[] = [
  { name: 'Gmail', note: 'Email', url: 'https://mail.google.com', color: 'teal' },
  { name: 'Gemini', note: 'AI research', url: 'https://gemini.google.com', color: 'purple' },
  { name: 'Calendar', note: 'Schedule', url: 'https://calendar.google.com', color: 'teal' },
  { name: 'Notes', note: 'Notes', url: '', color: 'green' },
  { name: 'LaunchPage', note: 'Launch Sheet', url: LAUNCH_SHEET, color: 'purple' },
  { name: 'Instagram', note: 'Social', url: 'https://www.instagram.com', color: 'teal' },
  { name: 'Figma', note: 'Design', url: 'https://www.figma.com/files', color: 'pink' },
  { name: 'SoundCloud', note: 'Music', url: 'https://soundcloud.com', color: 'green' }
];

export function seedLaunchers(): Launcher[] {
  return LAUNCHER_PRESETS.map((p, i) => ({ id: crypto.randomUUID(), ...p, routineIds: null, sort: i }));
}

/** The tiles that belong to one routine. Each routine keeps its own set. */
export const launchersFor = (list: Launcher[], routineId: string | null) =>
  routineId ? list.filter((l) => l.routineIds?.includes(routineId)).sort((a, b) => a.sort - b.sort) : [];

/** Tiles shared by every routine (the old model) become one separate copy per routine. */
export function splitShared(list: Launcher[], routineIds: string[]) {
  const shared = list.filter((l) => !l.routineIds || l.routineIds.length === 0);
  if (!shared.length || !routineIds.length) return null;
  const copies = routineIds.flatMap((rid) =>
    shared.map((l) => ({ ...l, id: crypto.randomUUID(), routineIds: [rid] }))
  );
  return { shared, copies, next: [...list.filter((l) => !shared.includes(l)), ...copies] };
}

/**
 * Routines saved twice (two devices seeding at once) share a name. Keep one per name:
 * the active one, else the one with the most tiles. Tiles from the copies move onto the
 * kept one unless it already has a tile with that name, so nothing you set up is lost.
 */
export function dedupeRoutines<R extends { id: string; name: string; kind: string }>(
  routines: R[],
  launchers: Launcher[],
  activeId: string | null
) {
  const groups = new Map<string, R[]>();
  for (const r of routines) {
    const key = `${r.kind}:${r.name.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const dropRoutines: R[] = [];
  const moved: Launcher[] = [];
  const dropTiles: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const count = (r: R) => launchers.filter((l) => l.routineIds?.includes(r.id)).length;
    const keep = group.find((r) => r.id === activeId) ?? [...group].sort((a, b) => count(b) - count(a))[0];
    const kept = launchers.filter((l) => l.routineIds?.includes(keep.id));
    const names = new Set(kept.map((l) => l.name.trim().toLowerCase()));
    let sort = kept.reduce((m, l) => Math.max(m, l.sort + 1), 0);
    for (const r of group) {
      if (r.id === keep.id) continue;
      dropRoutines.push(r);
      for (const l of launchers.filter((x) => x.routineIds?.includes(r.id)).sort((a, b) => a.sort - b.sort)) {
        const n = l.name.trim().toLowerCase();
        if (names.has(n)) dropTiles.push(l.id);
        else {
          names.add(n);
          moved.push({ ...l, routineIds: [keep.id], sort: sort++ });
        }
      }
    }
  }
  if (!dropRoutines.length) return null;
  const movedIds = new Map(moved.map((l) => [l.id, l]));
  const next = launchers.filter((l) => !dropTiles.includes(l.id)).map((l) => movedIds.get(l.id) ?? l);
  return { routines: routines.filter((r) => !dropRoutines.includes(r)), dropRoutines, moved, dropTiles, launchers: next };
}

export function seedLaunches(): Launch[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Pay mid-month bills',
      atTime: '10:00',
      repeat: 'monthly',
      weekdays: [],
      monthDay: 15,
      onDate: null,
      minutes: 30,
      urls: [],
      active: false, // an example: add the bill sites, then switch it on
      movedTo: null,
      sound: true,
      notify: false,
      sort: 0
    }
  ];
}

type LauncherRow = {
  id: string;
  name: string;
  note: string;
  url: string;
  color: TileColor;
  routine_ids: string[] | null;
  sort: number;
  hidden?: boolean;
};

type LaunchRow = {
  id: string;
  title: string;
  at_time: string;
  repeat: Repeat;
  weekdays: number[];
  month_day: number | null;
  on_date: string | null;
  minutes: number;
  urls: string[];
  active: boolean;
  moved_to?: string | null;
  sound?: boolean;
  notify?: boolean;
  tone?: string;
  once_time?: { date: string; atTime: string } | null;
  ritual_id?: string | null;
  log_kind?: string | null;
  log_amount?: number | null;
  until_time?: string | null;
  more_dates?: string[] | null;
  sort: number;
};

export const launcherStore = makeStore<Launcher, LauncherRow>({
  table: 'launchers',
  localKey: 'launchpage.launchers.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
  latestScript: 'supabase/migrations/0028_rocket_hidden.sql',
  // Before 0006 is run, pink is refused (saved as purple); before 0028, hidden stays on this device.
  legacyRow: (r) => {
    const x: Partial<LauncherRow> = r.color === 'pink' ? { ...r, color: 'purple' } : { ...r };
    delete x.hidden;
    return x;
  },
  seed: seedLaunchers,
  toRow: (l) => ({ id: l.id, name: l.name, note: l.note, url: l.url, color: l.color, routine_ids: l.routineIds, sort: l.sort, ...(l.hidden !== undefined ? { hidden: l.hidden } : {}) }),
  fromRow: (r) => ({ id: r.id, name: r.name, note: r.note, url: r.url, color: r.color, routineIds: r.routine_ids, sort: r.sort, hidden: !!r.hidden })
});

export const launchStore = makeStore<Launch, LaunchRow>({
  table: 'launches',
  localKey: 'launchpage.launches.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
  latestScript: 'supabase/migrations/0020_launch_logging_hourly.sql',
  // Before 0004/0005/0013/0016/0019 are run: save without moved_to, sound, notify, tone, once_time and ritual_id.
  legacyRow: (r) => {
    const x = { ...r };
    delete x.ritual_id;
    delete x.log_kind;
    delete x.log_amount;
    delete x.until_time;
    // Before 0020, hourly isn't allowed in the cloud: keep it as every day there (this device keeps hourly).
    if (x.repeat === 'hourly') x.repeat = 'weekly';
    delete x.once_time;
    delete x.tone;
    delete x.moved_to;
    delete x.sound;
    delete x.notify;
    return x;
  },
  seed: seedLaunches,
  toRow: (l) => ({
    id: l.id,
    title: l.title,
    at_time: l.atTime,
    repeat: l.repeat,
    weekdays: l.weekdays,
    month_day: l.monthDay,
    on_date: l.onDate,
    minutes: l.minutes,
    urls: l.urls,
    active: l.active,
    ...(l.movedTo ? { moved_to: l.movedTo } : {}),
    sound: l.sound,
    notify: l.notify,
    tone: l.tone ?? 'marimba',
    once_time: l.onceTime ?? null,
    // Only sent once the column exists (0019) or a ritual is picked, so older setups keep saving cleanly.
    ...('ritualId' in l ? { ritual_id: l.ritualId ?? null } : {}),
    ...('logKind' in l ? { log_kind: l.logKind ?? null, log_amount: l.logAmount ?? null } : {}),
    ...('untilTime' in l ? { until_time: l.untilTime ?? null } : {}),
    // Only sent when there are more dates (needs 0024), so older setups keep saving cleanly.
    ...(l.moreDates && l.moreDates.length ? { more_dates: l.moreDates } : 'moreDates' in l && l.moreDates ? { more_dates: [] } : {}),
    sort: l.sort
  }),
  fromRow: (r) => ({
    id: r.id,
    title: r.title,
    atTime: r.at_time,
    repeat: r.repeat,
    weekdays: r.weekdays ?? [],
    monthDay: r.month_day,
    onDate: r.on_date,
    minutes: r.minutes,
    urls: r.urls ?? [],
    active: r.active,
    movedTo: r.moved_to ?? null,
    sound: r.sound ?? true,
    notify: r.notify ?? false,
    // Old Chime launches play Marimba.
    tone: isTone(r.tone) ? r.tone : 'marimba',
    onceTime: r.once_time ?? null,
    ...(r.ritual_id !== undefined ? { ritualId: r.ritual_id } : {}),
    ...(r.log_kind !== undefined ? { logKind: (r.log_kind as LaunchLogKind | null) ?? null, logAmount: r.log_amount == null ? null : Number(r.log_amount) } : {}),
    ...(r.until_time !== undefined ? { untilTime: r.until_time } : {}),
    ...(r.more_dates !== undefined ? { moreDates: r.more_dates ?? [] } : {}),
    sort: r.sort
  })
});

// ---------- Scheduling ----------

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The routine day (Oct 20): timed launches roll over when the routine's day resets (its Bed
 * time, flipped on Nights; 4 AM, or 4 PM on nights, without one), the same as 26 Days, not at
 * midnight. So on nights, a 12:30 AM launch is still tonight and a 7 PM one is tomorrow's.
 * App sets the reset from the active routine on every render.
 */
let resetMin = 4 * 60;
export function setLaunchDayReset(min: number) {
  resetMin = ((Math.round(min) % 1440) + 1440) % 1440;
}

/** The calendar date this launch's run falls on, inside the routine day that holds `ref`. */
export function launchDate(l: Launch, ref: Date): Date {
  if (l.repeat === 'hourly') return ref;
  const since = (ref.getHours() * 60 + ref.getMinutes() - resetMin + 1440) % 1440;
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), ref.getMinutes() - since);
  const at = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes() + ((toMinutes(l.atTime) - resetMin + 1440) % 1440));
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 12);
}

/** Whether the launch runs in the routine day that holds `ref` (today's lists use this). */
export const happensToday = (l: Launch, ref: Date) => happensOn(l, launchDate(l, ref));

/** Calendar check: does the launch run on this date? */
export function happensOn(l: Launch, day: Date) {
  if (l.repeat === 'hourly') return true;
  if (l.movedTo && l.movedTo === isoDate(day)) return true;
  if (l.repeat === 'weekly') return l.weekdays.includes(day.getDay());
  if (l.repeat === 'monthly') return l.monthDay === day.getDate();
  const iso = isoDate(day);
  return l.onDate === iso || !!l.moreDates?.includes(iso);
}

/** Due from its start time until its time allotted runs out. */
export function isDue(l: Launch, now: Date) {
  if (!l.active || !happensToday(l, now)) return false;
  if (l.repeat === 'hourly') {
    const ago = (now.getTime() - slotStart(l, now).getTime()) / 60_000;
    return ago >= 0 && ago < Math.min(Math.max(l.minutes, 15), 59);
  }
  const start = toMinutes(timeFor(l, now));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= start && nowMin < start + Math.max(l.minutes, 15);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(l: Launch) {
  if (l.repeat === 'hourly') return `Every hour, ${clock12(l.atTime)}–${clock12(l.untilTime || l.atTime)}`;
  if (l.repeat === 'weekly') {
    if (l.weekdays.length === 7) return 'Every day';
    return l.weekdays.length ? l.weekdays.map((d) => WEEKDAY[d]).join(', ') : 'No days picked';
  }
  if (l.repeat === 'monthly') return l.monthDay ? `Monthly on the ${ordinal(l.monthDay)}` : 'Monthly';
  const dates = [l.onDate, ...(l.moreDates ?? [])].filter((x): x is string => !!x).sort();
  return dates.length ? dates.map((x) => new Date(`${x}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })).join(' / ') : 'One date';
}

function clock12(t: string) {
  const m = toMinutes(t);
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- Opening tabs ----------

/**
 * Desktop and phone apps that open from a link. The browser asks "Open this app?" the
 * first time; tick "Always allow" and it opens straight away after that.
 */
export const APP_LINKS: { name: string; url: string }[] = [
  { name: 'Claude', url: 'claude://' },
  { name: 'Slack', url: 'slack://open' },
  { name: 'Notion', url: 'notion://' },
  { name: 'Figma', url: 'figma://' },
  { name: 'Zoom', url: 'zoommtg://' },
  { name: 'Teams', url: 'msteams:' },
  { name: 'Discord', url: 'discord://' },
  { name: 'VS Code', url: 'vscode://' },
  // Web app (no desktop app link): opens as a tab.
  { name: 'Headway', url: 'https://makeheadway.com/' }
];

/**
 * Card rockets (Oct 20): open one of LaunchPage's own pages instead of a site.
 * Stored like a link ("launchpage:journal"); App says how to open them (setCardOpener).
 */
export const CARD_LINKS: { name: string; url: string; page: string }[] = [
  { name: 'Launch Page', url: 'launchpage:launch', page: 'launch' },
  { name: 'Journal', url: 'launchpage:journal', page: 'journal' },
  { name: 'Tasks', url: 'launchpage:tasks', page: 'tasks' },
  { name: '26 Days', url: 'launchpage:days26', page: 'days26' },
  { name: 'Budget', url: 'launchpage:budget', page: 'budget' }
];
export const cardOf = (url: string | null | undefined) => CARD_LINKS.find((c) => c.url === (url ?? '').trim()) ?? null;
let cardOpener: ((page: string) => void) | null = null;
export function setCardOpener(fn: (page: string) => void) {
  cardOpener = fn;
}
/** Opens a card rocket; false if the link isn't one. */
export function openCard(url: string | null | undefined) {
  const c = cardOf(url);
  if (!c) return false;
  cardOpener?.(c.page);
  return true;
}

const UNSAFE_SCHEMES = /^(javascript|data|vbscript|file|blob|about):/i;

/** An app link like claude:// or spotify: (anything with a scheme that isn't a web page). */
export function isAppLink(raw: string) {
  const u = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:/i.test(u) && !UNSAFE_SCHEMES.test(u) && !/^[^:]+:\d/.test(u);
}

export function normalizeUrl(raw: string) {
  const u = raw.trim();
  if (!u || UNSAFE_SCHEMES.test(u)) return '';
  if (isAppLink(u)) return u;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Hands an app link to the computer without opening an empty tab. */
function openApp(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Opens each link in its own tab. Must run straight from a click: browsers only allow
 * several tabs at once when the site may open pop-ups. Returns how many were blocked.
 */
export function openTabs(urls: string[]) {
  let blocked = 0;
  for (const raw of urls) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    // A timed launch opens each card in its own tab at that page (LaunchPage.app/#tasks), so the
    // Launch Page stays put and Tasks + Budget can both open (Oct 20). Tapping a tile stays in place.
    const card = cardOf(url);
    if (card) {
      const w = window.open(`${window.location.origin}${window.location.pathname}#${card.page}`, '_blank');
      if (!w) blocked += 1;
      continue;
    }
    if (isAppLink(url)) {
      openApp(url);
      continue;
    }
    const w = window.open(url, '_blank');
    if (w) w.opener = null;
    else blocked += 1;
  }
  return blocked;
}

// ---------- Reminders already handled today (per device) ----------

const HANDLED_KEY = 'launchpage.launches.handled.v1';

/** launched = tabs opened, waiting for you to check it off; done and skipped close it for today. */
export type HandledHow = 'launched' | 'done' | 'skipped';

export function readHandled(): Record<string, HandledHow | true> {
  try {
    return JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Records how today's run (or this hour's, for hourly) was handled. */
export function markHandled(l: Launch, day: Date, how: HandledHow = 'done') {
  const all = readHandled();
  all[runKey(l, day)] = how;
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all;
}

/** Skip today: a one-off moves to tomorrow; a repeating launch gets a make-up tomorrow, same time. */
export function skipToTomorrow(l: Launch, today: Date): Launch {
  // Hourly: skipping one hour just closes that hour.
  if (l.repeat === 'hourly') return l;
  const d = launchDate(l, today);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12);
  const tomorrow = isoDate(t);
  if (l.repeat === 'once') {
    // Several dates: only the skipped one moves to the next day.
    const run = isoDate(d);
    if (l.moreDates?.includes(run)) return { ...l, moreDates: l.moreDates.map((x) => (x === run ? tomorrow : x)), movedTo: null };
    return { ...l, onDate: tomorrow, movedTo: null };
  }
  return { ...l, movedTo: tomorrow };
}

/** Today's open ones first (by time), then the rest by time. */
export function orderLaunches(list: Launch[], today: Date, handled: Record<string, HandledHow | true>) {
  const key = (l: Launch) => runKey(l, today);
  const rank = (l: Launch) => {
    const h = handled[key(l)];
    const todays = l.active && happensToday(l, today);
    if (todays && (!h || h === 'launched')) return 0;
    if (todays) return 1;
    return l.active ? 2 : 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || timeFor(a, today).localeCompare(timeFor(b, today)));
}

/** "2 tabs + Claude" */
export function describeOpens(urls: string[]) {
  const apps = urls.filter(isAppLink).map((u) => APP_LINKS.find((a) => a.url === u)?.name ?? cardOf(u)?.name ?? 'app');
  const tabs = urls.length - apps.length;
  const parts: string[] = [];
  if (tabs || !apps.length) parts.push(`${tabs} ${tabs === 1 ? 'tab' : 'tabs'}`);
  if (apps.length) parts.push(apps.join(', '));
  return parts.join(' + ');
}

// ---------- Launch log: each run of a timed launch, kept for 26 Days ----------

export interface LaunchLog {
  id: string;
  launchId: string;
  day: string; // YYYY-MM-DD
  title: string;
  planned: number; // minutes allotted
  extra: number; // minutes added with +10
  outcome: 'launched' | 'done' | 'skipped';
  launchedAt: string | null;
  finishedAt: string | null;
  sort: number;
}

type LogRow = {
  id: string;
  launch_id: string;
  day: string;
  title: string;
  planned: number;
  extra: number;
  outcome: LaunchLog['outcome'];
  launched_at: string | null;
  finished_at: string | null;
  sort: number;
};

export const launchLogStore = makeStore<LaunchLog, LogRow>({
  table: 'launch_log',
  localKey: 'launchpage.launchlog.v1',
  orderBy: 'day',
  script: 'supabase/migrations/0016_launch_once_time_and_log.sql',
  seed: () => [],
  toRow: (g) => ({ id: g.id, launch_id: g.launchId, day: g.day, title: g.title, planned: g.planned, extra: g.extra, outcome: g.outcome, launched_at: g.launchedAt, finished_at: g.finishedAt, sort: g.sort }),
  fromRow: (r) => ({ id: r.id, launchId: r.launch_id, day: r.day, title: r.title, planned: r.planned, extra: r.extra, outcome: r.outcome, launchedAt: r.launched_at, finishedAt: r.finished_at, sort: r.sort })
});

/** Today's log row for a launch, made if missing. */
export function logFor(list: LaunchLog[], l: Launch, day: Date): LaunchLog {
  const iso = isoDate(launchDate(l, day));
  return (
    list.find((g) => g.launchId === l.id && g.day === iso) ?? {
      id: crypto.randomUUID(),
      launchId: l.id,
      day: iso,
      title: l.title,
      planned: l.minutes,
      extra: 0,
      outcome: 'launched',
      launchedAt: null,
      finishedAt: null,
      sort: 0
    }
  );
}
