import { makeStore } from './store';
import { toMinutes } from './routines';

export type TileColor = 'teal' | 'purple' | 'green';

export interface Launcher {
  id: string;
  name: string;
  note: string;
  url: string;
  color: TileColor;
  /** null = every routine. Linking tiles to routines comes later. */
  routineIds: string[] | null;
  sort: number;
}

export type Repeat = 'weekly' | 'monthly' | 'once';

/** A timed launch: at its time a reminder pops up and one tap opens every tab. */
export interface Launch {
  id: string;
  title: string;
  atTime: string; // "HH:MM"
  repeat: Repeat;
  weekdays: number[]; // 0 = Sunday
  monthDay: number | null;
  onDate: string | null; // "YYYY-MM-DD"
  minutes: number;
  urls: string[];
  active: boolean;
  /** A one-time make-up date, set when a repeating launch is skipped. */
  movedTo: string | null;
  sort: number;
}

const LAUNCH_SHEET = 'https://docs.google.com/spreadsheets/d/1rH_8_qYR592YNtbU0oEeByxpmkLm6R4bgVltUr8KABw/edit';

/** The eight tiles from the LAUNCH PAGE tab of the Launch Sheet. */
export function seedLaunchers(): Launcher[] {
  const tiles: [string, string, string, TileColor][] = [
    ['Gmail', 'Email', 'https://mail.google.com', 'teal'],
    ['Gemini', 'AI research', 'https://gemini.google.com', 'purple'],
    ['Calendar', 'Schedule', 'https://calendar.google.com', 'teal'],
    ['Notes', 'Add your notes link', '', 'green'],
    ['LaunchPage', 'Launch Sheet', LAUNCH_SHEET, 'purple'],
    ['Instagram', 'Social', 'https://www.instagram.com', 'teal'],
    ['Figma', 'Design', 'https://www.figma.com/files', 'purple'],
    ['SoundCloud', 'Music', 'https://soundcloud.com', 'green']
  ];
  return tiles.map(([name, note, url, color], i) => ({
    id: crypto.randomUUID(),
    name,
    note,
    url,
    color,
    routineIds: null,
    sort: i
  }));
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
  sort: number;
};

export const launcherStore = makeStore<Launcher, LauncherRow>({
  table: 'launchers',
  localKey: 'launchpage.launchers.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
  seed: seedLaunchers,
  toRow: (l) => ({ id: l.id, name: l.name, note: l.note, url: l.url, color: l.color, routine_ids: l.routineIds, sort: l.sort }),
  fromRow: (r) => ({ id: r.id, name: r.name, note: r.note, url: r.url, color: r.color, routineIds: r.routine_ids, sort: r.sort })
});

export const launchStore = makeStore<Launch, LaunchRow>({
  table: 'launches',
  localKey: 'launchpage.launches.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
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
    sort: r.sort
  })
});

// ---------- Scheduling ----------

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function happensOn(l: Launch, day: Date) {
  if (l.movedTo && l.movedTo === isoDate(day)) return true;
  if (l.repeat === 'weekly') return l.weekdays.includes(day.getDay());
  if (l.repeat === 'monthly') return l.monthDay === day.getDate();
  return l.onDate === isoDate(day);
}

/** Due from its start time until its time allotted runs out. */
export function isDue(l: Launch, now: Date) {
  if (!l.active || !happensOn(l, now)) return false;
  const start = toMinutes(l.atTime);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= start && nowMin < start + Math.max(l.minutes, 15);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeSchedule(l: Launch) {
  if (l.repeat === 'weekly') {
    if (l.weekdays.length === 7) return 'Every day';
    return l.weekdays.length ? l.weekdays.map((d) => WEEKDAY[d]).join(', ') : 'No days picked';
  }
  if (l.repeat === 'monthly') return l.monthDay ? `Monthly on the ${ordinal(l.monthDay)}` : 'Monthly';
  return l.onDate ? new Date(`${l.onDate}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : 'One date';
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- Opening tabs ----------

export function normalizeUrl(raw: string) {
  const u = raw.trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
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

export function markHandled(id: string, day: Date, how: HandledHow = 'done') {
  const all = readHandled();
  all[`${id}:${isoDate(day)}`] = how;
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all;
}

/** Skip today: a one-off moves to tomorrow; a repeating launch gets a make-up tomorrow, same time. */
export function skipToTomorrow(l: Launch, today: Date): Launch {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const tomorrow = isoDate(t);
  return l.repeat === 'once' ? { ...l, onDate: tomorrow, movedTo: null } : { ...l, movedTo: tomorrow };
}

/** Today's open ones first (by time), then the rest by time. */
export function orderLaunches(list: Launch[], today: Date, handled: Record<string, HandledHow | true>) {
  const key = (l: Launch) => `${l.id}:${isoDate(today)}`;
  const rank = (l: Launch) => {
    const h = handled[key(l)];
    const todays = l.active && happensOn(l, today);
    if (todays && (!h || h === 'launched')) return 0;
    if (todays) return 1;
    return l.active ? 2 : 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.atTime.localeCompare(b.atTime));
}
