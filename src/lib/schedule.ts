import { happensOn, isoDate, type Launch } from './rockets';
import { toMinutes } from './routines';

/**
 * SCHEDULE GUARDRAILS, phase 1 (Dan, Nov 16): a timed launch that overlaps another block on the same date
 * is caught on Save. Water, food and vices launches and hourly ones never count: they're check-offs, not blocks.
 */
export type Clash = { launch: Launch; day: string; start: number; end: number };

const counts = (x: Launch) => x.repeat !== 'hourly' && !['h2o', 'food', 'vices'].includes(x.logKind ?? '');
const at = (x: Launch, day: string) => toMinutes(x.onceTime && x.onceTime.date === day ? x.onceTime.atTime : x.atTime);
const noon = (iso: string) => new Date(`${iso}T12:00:00`);

/** The dates a launch will next run on: a one-time launch's own dates, or the next 14 days for a repeating one. */
function datesOf(l: Launch, today: Date): string[] {
  const from = isoDate(today);
  if (l.repeat === 'once') return [l.onDate, ...(l.moreDates ?? [])].filter((d): d is string => !!d && d >= from);
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
    if (happensOn(l, d)) out.push(isoDate(d));
  }
  return out;
}

/** Other launches this one would overlap (one entry per launch, its first clash). */
export function clashesFor(l: Launch, all: Launch[], today: Date): Clash[] {
  if (!counts(l) || !l.active) return [];
  const out: Clash[] = [];
  for (const day of datesOf(l, today)) {
    const s = at(l, day);
    const e = s + Math.max(1, l.minutes);
    for (const o of all) {
      if (o.id === l.id || !o.active || !counts(o) || out.some((c) => c.launch.id === o.id)) continue;
      if (!happensOn(o, noon(day))) continue;
      const os = at(o, day);
      const oe = os + Math.max(1, o.minutes);
      if (s < oe && os < e) out.push({ launch: o, day, start: os, end: oe });
    }
  }
  return out;
}

/** The first start time on that day, after the clash, where the whole launch fits (null = nothing before midnight). */
export function nextFree(l: Launch, day: string, all: Launch[]): string | null {
  const len = Math.max(1, l.minutes);
  const blocks = all
    .filter((o) => o.id !== l.id && o.active && counts(o) && happensOn(o, noon(day)))
    .map((o) => ({ s: at(o, day), e: at(o, day) + Math.max(1, o.minutes) }))
    .sort((a, b) => a.s - b.s);
  let t = at(l, day);
  for (let moved = true; moved; ) {
    moved = false;
    for (const b of blocks) {
      if (t < b.e && b.s < t + len) {
        t = b.e;
        moved = true;
      }
    }
  }
  if (t + len > 1440) return null;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** "WORK BLOCK - L4UNCH P4GE BETA - Decide off days" + "WORK BLOCK - L4UNCH P4GE BETA - Modules cleanup"
 *  → "WORK BLOCK - L4UNCH P4GE BETA - Decide off days + Modules cleanup". */
export function mergedTitle(into: string, add: string): string {
  const a = into.split(' - ');
  const b = add.split(' - ');
  let i = 0;
  while (i < a.length - 1 && i < b.length - 1 && a[i].trim() === b[i].trim()) i++;
  return `${into} + ${b.slice(i).join(' - ')}`;
}

export const hhmm12 = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
