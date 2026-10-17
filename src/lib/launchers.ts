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
  /** Chime at the start and when the time allotted runs out. */
  sound: boolean;
  /** Desktop notification at the start and the end. */
  notify: boolean;
  sort: number;
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
  sort: number;
};

export const launcherStore = makeStore<Launcher, LauncherRow>({
  table: 'launchers',
  localKey: 'launchpage.launchers.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
  latestScript: 'supabase/migrations/0006_launcher_pink.sql',
  // Before 0006 is run, pink is refused: save the tile as purple in Supabase until then.
  legacyRow: (r) => (r.color === 'pink' ? { ...r, color: 'purple' } : r),
  seed: seedLaunchers,
  toRow: (l) => ({ id: l.id, name: l.name, note: l.note, url: l.url, color: l.color, routine_ids: l.routineIds, sort: l.sort }),
  fromRow: (r) => ({ id: r.id, name: r.name, note: r.note, url: r.url, color: r.color, routineIds: r.routine_ids, sort: r.sort })
});

export const launchStore = makeStore<Launch, LaunchRow>({
  table: 'launches',
  localKey: 'launchpage.launches.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0003_launchers_events.sql',
  latestScript: 'supabase/migrations/0005_launch_alerts.sql',
  // Before 0004/0005 are run: save without moved_to, sound and notify.
  legacyRow: (r) => {
    const x = { ...r };
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

/**
 * Desktop and phone apps that open from a link. The browser asks "Open this app?" the
 * first time; tick "Always allow" and it opens straight away after that.
 */
export const APP_LINKS: { name: string; url: string }[] = [
  { name: 'Claude', url: 'claude://' },
  { name: 'Slack', url: 'slack://open' },
  { name: 'Spotify', url: 'spotify:' },
  { name: 'Notion', url: 'notion://' },
  { name: 'Figma', url: 'figma://' },
  { name: 'Zoom', url: 'zoommtg://' },
  { name: 'Teams', url: 'msteams:' },
  { name: 'Discord', url: 'discord://' },
  { name: 'VS Code', url: 'vscode://' },
  { name: 'Obsidian', url: 'obsidian://open' }
];

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

/** "2 tabs + Claude" */
export function describeOpens(urls: string[]) {
  const apps = urls.filter(isAppLink).map((u) => APP_LINKS.find((a) => a.url === u)?.name ?? 'app');
  const tabs = urls.length - apps.length;
  const parts: string[] = [];
  if (tabs || !apps.length) parts.push(`${tabs} ${tabs === 1 ? 'tab' : 'tabs'}`);
  if (apps.length) parts.push(apps.join(', '));
  return parts.join(' + ');
}
