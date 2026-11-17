import { isoDate } from './rockets';

/**
 * V20-289 (Dan, Nov 17): the current month rolls like the routine. The list starts at today: rows on or after today
 * come first, and rows from earlier in the month follow below, after a divider. Other months keep plain date order.
 * A row with no date stays with the upcoming ones. A row's place is its next date from today (repeats have several).
 */
export type Rolled<T> = { row: T; earlier: boolean; firstEarlier: boolean };

export function rollFromToday<T>(rows: T[], datesOf: (r: T) => string[], month: string, now = new Date()): Rolled<T>[] {
  const today = isoDate(now);
  if (today.slice(0, 7) !== month) return rows.map((row) => ({ row, earlier: false, firstEarlier: false }));
  const key = (r: T) => {
    const d = datesOf(r);
    return d.length ? (d.find((x) => x >= today) ?? null) : '';
  };
  const ahead: T[] = [];
  const behind: T[] = [];
  for (const r of rows) (key(r) === null ? behind : ahead).push(r);
  ahead.sort((a, b) => {
    const ka = key(a) || '9999';
    const kb = key(b) || '9999';
    return ka.localeCompare(kb);
  });
  return [
    ...ahead.map((row) => ({ row, earlier: false, firstEarlier: false })),
    ...behind.map((row, i) => ({ row, earlier: true, firstEarlier: i === 0 && ahead.length > 0 }))
  ];
}
