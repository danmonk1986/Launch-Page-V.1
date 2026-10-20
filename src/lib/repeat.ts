/**
 * One Repeat for Tasks and Budget (Oct 20): None / Weekly / Monthly / Quarterly / Annually.
 * Stored as one short string (a task's repeat_rule, a budget line's repeat_rule):
 *   Weekly     "W:1,4"        days of the week, 0 = Sunday
 *   Monthly    "M:17"         a date (past the end of a short month = its last day)
 *              "M:1ST THU"    a weekday (1ST–4TH or LAST)
 *   Quarterly  "Q1:15"        same as monthly, every 3 months starting in month 1–12
 *   Annually   "A:04-30"      month-day
 * Older tasks kept the kind in their status (MTH RCR / ANN RCR) with a bare rule ("17",
 * "1st THU", "04-30"); those still read as Monthly / Annually.
 */
export type RepeatKind = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export interface Repeat {
  kind: RepeatKind;
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Monthly / Quarterly: "17" or "1ST THU". */
  rule: string;
  /** Quarterly: the first month, 1–12. */
  startMonth: number;
  /** Annually: "MM-DD". */
  date: string;
}

export const REPEAT_KINDS: { id: RepeatKind; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annually' }
];

export const NO_REPEAT: Repeat = { kind: 'none', days: [], rule: '1', startMonth: 1, date: '01-01' };

/** A fresh repeat of this kind, starting from a date if there is one. */
export function startRepeat(kind: RepeatKind, from?: string | null): Repeat {
  const d = from ? new Date(`${from}T12:00:00`) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { ...NO_REPEAT, kind, days: [d.getDay()], rule: String(d.getDate()), startMonth: d.getMonth() + 1, date: `${mm}-${dd}` };
}

export function readRepeat(raw: string | null | undefined, legacyStatus?: string | null): Repeat {
  const r = (raw ?? '').trim().toUpperCase();
  const base = { ...NO_REPEAT };
  let m = r.match(/^W:([\d,]*)$/);
  if (m) return { ...base, kind: 'weekly', days: m[1].split(',').filter(Boolean).map(Number).filter((n) => n >= 0 && n <= 6) };
  m = r.match(/^M:(.+)$/);
  if (m) return { ...base, kind: 'monthly', rule: m[1].trim() };
  m = r.match(/^Q(\d{1,2}):(.+)$/);
  if (m) return { ...base, kind: 'quarterly', startMonth: Math.min(12, Math.max(1, Number(m[1]))), rule: m[2].trim() };
  m = r.match(/^A:(\d{1,2}-\d{1,2})$/);
  if (m) return { ...base, kind: 'annual', date: m[1] };
  // Older tasks: the status said which kind.
  if (legacyStatus === 'ANN RCR' && /^\d{1,2}-\d{1,2}$/.test(r)) return { ...base, kind: 'annual', date: r };
  if (legacyStatus === 'MTH RCR' && r) return { ...base, kind: 'monthly', rule: r };
  return base;
}

export function writeRepeat(x: Repeat): string | null {
  switch (x.kind) {
    case 'weekly':
      return `W:${[...new Set(x.days)].sort().join(',')}`;
    case 'monthly':
      return `M:${x.rule}`;
    case 'quarterly':
      return `Q${x.startMonth}:${x.rule}`;
    case 'annual':
      return `A:${x.date}`;
    default:
      return null;
  }
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** "17" or "1ST THU" on this day of its month. */
function monthRuleOn(rule: string, day: Date) {
  const r = rule.trim().toUpperCase();
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  if (/^\d{1,2}$/.test(r)) return Math.min(Number(r), last) === day.getDate();
  const m = r.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  if (!m || DOW.indexOf(m[2]) !== day.getDay()) return false;
  if (m[1] === 'LAST') return day.getDate() + 7 > last;
  return Math.ceil(day.getDate() / 7) === parseInt(m[1], 10);
}

export function repeatOn(x: Repeat, day: Date): boolean {
  switch (x.kind) {
    case 'weekly':
      return x.days.includes(day.getDay());
    case 'monthly':
      return monthRuleOn(x.rule, day);
    case 'quarterly':
      return (day.getMonth() + 1 - x.startMonth + 12) % 3 === 0 && monthRuleOn(x.rule, day);
    case 'annual': {
      const [mo, dy] = x.date.split('-').map(Number);
      const last = new Date(day.getFullYear(), mo, 0).getDate();
      return day.getMonth() + 1 === mo && Math.min(dy, last) === day.getDate();
    }
    default:
      return false;
  }
}

/** The next date it lands on, from today (up to about a year and a half ahead). */
export function nextRepeat(x: Repeat, from: Date): string | null {
  if (x.kind === 'none') return null;
  for (let i = 0; i < 550; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12);
    if (repeatOn(x, d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORD_LABEL: Record<string, string> = { '1ST': '1st', '2ND': '2nd', '3RD': '3rd', '4TH': '4th', LAST: 'Last' };
const WEEKDAY_LABEL: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
export const nth = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

function describeMonthRule(rule: string) {
  const r = rule.trim().toUpperCase();
  if (/^\d{1,2}$/.test(r)) return nth(Number(r));
  const m = r.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  return m ? `${ORD_LABEL[m[1]]} ${WEEKDAY_LABEL[m[2]] ?? m[2]}` : r;
}

/** "Mon, Thu" · "17th" · "1st Thursday" · "15th · Jan Apr Jul Oct" · "Apr 30" */
export function describeRepeat(x: Repeat): string {
  switch (x.kind) {
    case 'weekly':
      return x.days.length === 7 ? 'Every day' : [...x.days].sort().map((d) => DAY_SHORT[d]).join(', ') || 'Weekly';
    case 'monthly':
      return describeMonthRule(x.rule);
    case 'quarterly':
      return `${describeMonthRule(x.rule)} · ${[0, 3, 6, 9].map((k) => MONTHS[(x.startMonth - 1 + k) % 12]).join(' ')}`;
    case 'annual': {
      const [mo, dy] = x.date.split('-').map(Number);
      return `${MONTHS[mo - 1] ?? ''} ${dy}`;
    }
    default:
      return '';
  }
}
