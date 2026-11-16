/**
 * V20-268 (Dan, Nov 15): Log the time? also asks when the work started, so a run ticked done
 * without the clock still has a start and a finish (Stats' best time slot reads the start).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The Start shown first: now minus the minutes when the run is today's; a past day's run uses its set time. */
export function defaultStart(minutes: number, opts?: { day?: string | null; atTime?: string | null }, now = new Date()): string {
  const back = new Date(now.getTime() - Math.max(1, minutes) * 60_000);
  if (!opts?.day || opts.day === isoDay(now)) return hhmm(back);
  return opts.atTime || '12:00';
}

/** The start as a timestamp. A run's day is kept; never later than now minus the minutes. */
export function startIso(start: string, minutes: number, day?: string | null, now = new Date()): string {
  const latest = now.getTime() - Math.max(1, minutes) * 60_000;
  let t = new Date(`${day || isoDay(now)}T${start}:00`);
  // No day given: a time later than now means last night (e.g. 23:00 logged at 1 AM).
  if (!day && t.getTime() > now.getTime()) t = new Date(t.getTime() - 86_400_000);
  if (Number.isNaN(t.getTime()) || t.getTime() > latest) t = new Date(latest);
  return t.toISOString();
}

/** The finish: start plus the minutes. */
export const finishIso = (startAt: string, minutes: number) => new Date(new Date(startAt).getTime() + Math.max(1, minutes) * 60_000).toISOString();

/**
 * V20-276 (Dan, Nov 16): a run left running asks Log the time? with a best guess of the real block: from the later of
 * when it was started and its set time today (a launch moved to 1:00 PM whose run auto-started at 1:00 AM starts at
 * 1:00 PM), up to now. Never more than 8 hours.
 */
export function leftRunningGuess(launchedAt: string | null, setStart: Date | null, now = new Date()): { start: string; minutes: number } {
  const la = launchedAt ? new Date(launchedAt) : null;
  let st = la ?? setStart ?? now;
  if (setStart && setStart.getTime() <= now.getTime() && (!la || setStart.getTime() > la.getTime())) st = setStart;
  const minutes = Math.min(480, Math.max(1, Math.round((now.getTime() - st.getTime()) / 60_000)));
  const s = new Date(now.getTime() - minutes * 60_000);
  return { start: hhmm(s), minutes };
}
