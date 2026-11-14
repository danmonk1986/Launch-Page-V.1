import { isoDate, missedRuns, type Launch, type LaunchLog } from './rockets';
import { logsProductivity, type Project } from './projects';

/**
 * V20-185 (Dan, Nov 14): Stats, like the CEO dashboard (MVP sample week). Pure numbers, drawn by Stats.tsx.
 * Rules (STATS tab notes):
 * - Hours count from Day 27 (routine day ≥ Nov 13), bucketed by the run's routine day.
 * - Done rate and baseline count from Oct 16.
 * - A project's Log Productivity switch decides productivity vs personal time (no project = productivity).
 * - Overlap (Dan, Nov 14): a run that starts while another is running keeps its own minutes; the run it
 *   started inside gives those minutes up. Each logs in its own place, and the day counts the time once.
 * - Runs over 4 h are flagged.
 */
export const DAY27 = '2026-11-13';
export const DAY1 = '2026-10-16';
export type StatsRange = 'week' | 'd26' | 'quarter' | 'all';
export const RANGES: [StatsRange, string][] = [
  ['week', 'Week'],
  ['d26', '26 Days'],
  ['quarter', 'Quarter'],
  ['all', 'All time']
];
const SPAN: Record<StatsRange, number> = { week: 7, d26: 26, quarter: 91, all: 100000 };

export type StatRun = LaunchLog & { what: string; projectName: string; color: string; productive: boolean; minutes: number; overlapMin: number; startHour: number | null; long: boolean };

export function rangeFrom(range: StatsRange, today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (SPAN[range] - 1), 12);
  const iso = isoDate(d);
  return iso < DAY1 ? DAY1 : iso;
}

/** What = the launch's category, the name before its first " - " (WORK BLOCK - … → WORK BLOCK). */
export const whatOf = (title: string) => (title.split(/ [-·–—] /)[0].trim() || title).toUpperCase().replace(/\s*#\d+$/, '');
const dayOf = (g: LaunchLog) => g.routineDay ?? g.day;
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);

/** Done runs in range that count hours (Day 27 on), with the overlap taken out of the run that was interrupted. */
export function hourRuns(log: LaunchLog[], projects: Project[], from: string, to: string): StatRun[] {
  const start = from < DAY27 ? DAY27 : from;
  const done = log.filter((g) => g.outcome === 'done' && dayOf(g) >= start && dayOf(g) <= to && (g.loggedMin ?? 0) > 0 && g.timeSource !== 'none');
  // Overlap: only runs that really ran on the clock have a start and an end.
  const timed = done.filter((g) => g.timeSource === 'timed' && g.launchedAt && g.finishedAt);
  const cut = new Map<string, number>();
  for (const a of timed) {
    const a0 = ms(a.launchedAt), a1 = ms(a.finishedAt);
    let lost = 0;
    for (const b of timed) {
      if (b.id === a.id) continue;
      const b0 = ms(b.launchedAt), b1 = ms(b.finishedAt);
      // b started while a was running (later start wins the shared minutes).
      if (b0 > a0 && b0 < a1) lost += (Math.min(a1, b1) - b0) / 60_000;
    }
    if (lost > 0) cut.set(a.id, Math.round(lost));
  }
  return done.map((g) => {
    const p = g.projectId ? projects.find((x) => x.id === g.projectId) : null;
    const area = p?.parentId ? projects.find((x) => x.id === p.parentId) : null;
    const overlapMin = Math.min(cut.get(g.id) ?? 0, g.loggedMin ?? 0);
    const minutes = Math.max(0, (g.loggedMin ?? 0) - overlapMin);
    const t = g.launchedAt ? new Date(g.launchedAt) : null;
    return {
      ...g,
      what: whatOf(g.title),
      projectName: p ? (p.shortName?.trim() || p.name) : 'No project',
      color: p?.color ?? area?.color ?? '#A79FC9',
      productive: p ? logsProductivity(projects, p) : true,
      minutes,
      overlapMin,
      startHour: g.timeSource === 'timed' && t ? t.getHours() : null,
      long: (g.loggedMin ?? 0) > 240
    };
  });
}

export type Bar = { key: string; label: string; minutes: number; runs: number; color?: string };
export function groupBy(runs: StatRun[], key: (r: StatRun) => string, label?: (r: StatRun) => string, color?: (r: StatRun) => string): Bar[] {
  const m = new Map<string, Bar>();
  for (const r of runs) {
    const k = key(r);
    const b = m.get(k) ?? { key: k, label: label ? label(r) : k, minutes: 0, runs: 0, color: color?.(r) };
    b.minutes += r.minutes;
    b.runs += 1;
    m.set(k, b);
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes);
}

/** Done rate per launch (the 60% gate): done out of done + skipped + missed; cleared counts neither way. */
export function doneRates(launches: Launch[], log: LaunchLog[], today: Date, from: string, offDays: Set<string>) {
  const to = isoDate(today);
  const groups = new Map<string, { name: string; done: number; skipped: number; missed: number }>();
  const add = (t: string, k: 'done' | 'skipped' | 'missed') => {
    const name = t.split(/ [-·–—] /)[0].trim() || t;
    const g = groups.get(name) ?? { name, done: 0, skipped: 0, missed: 0 };
    g[k] += 1;
    groups.set(name, g);
  };
  for (const g of log) {
    if (g.day < from || g.day > to) continue;
    if (g.outcome === 'done') add(g.title, 'done');
    else if (g.outcome === 'skipped') add(g.title, 'skipped');
  }
  const days = Math.max(1, Math.round((today.getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1);
  for (const m of missedRuns(launches, log, today, days, offDays)) if (m.day >= from) add(m.launch.title, 'missed');
  return [...groups.values()]
    .map((g) => ({ ...g, total: g.done + g.skipped + g.missed }))
    .filter((g) => g.total > 0)
    .map((g) => ({ ...g, pct: Math.round((g.done / g.total) * 100) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** V20-197 (Dan, Nov 14): hours and minutes, not decimal hours: 3h 03m, 3m, 0m. */
export const fmtH = (min: number) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
};
export const SOURCE_LABEL: Record<string, string> = {
  timed: '▶ to ✓, pauses out',
  entered: 'Log the time?',
  allotted: 'Time allotted (before Nov 14)',
  none: "Don't log (before Nov 14)"
};
