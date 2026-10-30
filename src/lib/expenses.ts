import { makeStore } from './store';
import type { BudgetLine } from './budget';
import { readRepeat, repeatOn, type Repeat } from './repeat';

/**
 * Expenses (LP-030, Oct 25): what was actually paid. Same columns as the Launch Sheet
 * EXPENSES tab: DIVISION, DATE, DESCRIPTION, PMT METHOD, PMT TYPE, EXPENSE CATEGORY,
 * PMT CATEGORY, TOTAL $, GST/HST. (The sheet's per-category columns are a breakdown of
 * TOTAL by PMT CATEGORY, so they're worked out, not stored.)
 * Ticking a task linked to a budget line adds one here; a month counts as paid for that
 * line when it has an expense in that month.
 */
export interface Expense {
  id: string;
  /** DIVISION in the sheet (the budget line's project / area). */
  project: string;
  /** yyyy-mm-dd */
  date: string;
  description: string;
  method: string;
  type: string;
  category: string;
  pmtCategory: string;
  amount: number | null;
  gst: number | null;
  notes: string;
  budgetLineId: string | null;
  taskId: string | null;
  sort: number;
  /** Priced in another currency: the original price; `amount` is the CAD. Columns from 0032. */
  foreign?: number | null;
  currency?: string;
}

type Row = {
  id: string;
  project: string;
  on_date: string;
  description: string;
  method: string;
  pmt_type: string;
  category: string;
  pmt_category: string;
  amount: number | string | null;
  gst: number | string | null;
  notes: string;
  budget_line_id: string | null;
  task_id: string | null;
  sort: number;
  foreign_amount?: number | string | null;
  currency?: string | null;
};

const num = (v: number | string | null | undefined) => (v === null || v === '' || v === undefined ? null : Number(v));

export const expenseStore = makeStore<Expense, Row>({
  table: 'expenses',
  localKey: 'launchpage.expenses.v1',
  orderBy: 'on_date',
  script: 'supabase/migrations/0031_budget_links.sql',
  seed: () => [],
  toRow: (e) => ({
    id: e.id,
    project: e.project,
    on_date: e.date,
    description: e.description,
    method: e.method,
    pmt_type: e.type,
    category: e.category,
    pmt_category: e.pmtCategory,
    amount: e.amount,
    gst: e.gst,
    notes: e.notes,
    budget_line_id: e.budgetLineId,
    task_id: e.taskId,
    sort: e.sort,
    currency: e.currency ?? '',
    foreign_amount: e.currency ? e.foreign ?? null : null
  }),
  fromRow: (r) => ({
    id: r.id,
    project: r.project ?? '',
    date: String(r.on_date).slice(0, 10),
    description: r.description ?? '',
    method: r.method ?? '',
    type: r.pmt_type ?? '',
    category: r.category ?? '',
    pmtCategory: r.pmt_category ?? '',
    amount: num(r.amount),
    gst: num(r.gst),
    notes: r.notes ?? '',
    budgetLineId: r.budget_line_id ?? null,
    taskId: r.task_id ?? null,
    sort: r.sort ?? 0,
    ...(r.currency ? { currency: r.currency, foreign: num(r.foreign_amount) } : {})
  })
});

export function newExpense(date: string, sort: number): Expense {
  return { id: crypto.randomUUID(), project: '', date, description: '', method: '', type: '', category: '', pmtCategory: '', amount: null, gst: null, notes: '', budgetLineId: null, taskId: null, sort };
}

/** The expense a paid budget line adds: the line's fields, dated the day it was paid. */
export function expenseFromLine(line: BudgetLine, date: string, taskId: string | null, sort: number): Expense {
  return {
    ...newExpense(date, sort),
    project: line.project,
    description: line.description,
    method: line.method,
    type: line.type,
    category: line.category,
    pmtCategory: line.pmtCategory,
    amount: line.amount,
    ...(line.currency ? { currency: line.currency, foreign: line.foreign ?? null } : {}),
    budgetLineId: line.id,
    taskId
  };
}

/** "2026-11" */
export const monthKey = (iso: string) => iso.slice(0, 7);

/** Expenses for this budget line in this month ("2026-11"). */
export const paidIn = (list: Expense[], lineId: string, month: string) => list.filter((e) => e.budgetLineId === lineId && monthKey(e.date) === month);

/** Total spent in a month, optionally for one budget line. */
export const spentIn = (list: Expense[], month: string, lineId?: string) =>
  list.filter((e) => monthKey(e.date) === month && (!lineId || e.budgetLineId === lineId)).reduce((a, e) => a + (e.amount ?? 0), 0);

// ---------- Month view (LP-030 step 5) ----------

/** The days of a month ("2026-11") a repeat lands on. */
export function daysIn(month: string, landsOn: (d: Date) => boolean): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) if (landsOn(new Date(y, m - 1, d, 12))) out.push(`${month}-${String(d).padStart(2, '0')}`);
  return out;
}

export interface MonthLine {
  line: BudgetLine;
  /** The days it's due this month (empty for variable lines: an allotment for the whole month). */
  dates: string[];
  /** What's budgeted this month: the amount × the times it lands (weekly lines land 4–5 times). */
  due: number;
  /** Expenses for this line this month. */
  spent: number;
}

/**
 * What lands in a month: monthly lines, quarterly lines in their months, annual lines only in
 * their month, one-offs dated that month, and variable lines (planned) every month.
 */
/**
 * How a line repeats. Lines imported from the sheet often have no repeat yet: a fixed line with
 * a date repeats on that day monthly, an annual line on that date yearly.
 */
export function lineRepeat(l: BudgetLine): Repeat {
  const r = readRepeat(l.repeat);
  if (r.kind !== 'none' || !l.date) return r;
  if (l.section === 'fixed') return readRepeat(`M:${Number(l.date.slice(8, 10))}`);
  if (l.section === 'annual') return readRepeat(`A:${l.date.slice(5, 10)}`);
  return r;
}

/** Oct 28: where a line sits in its month (or year), for sorting Budget by date. Undated lines go last. */
export function lineDateKey(l: BudgetLine): number {
  const r = lineRepeat(l);
  const dayOf = (rule: string) => {
    const u = rule.trim().toUpperCase();
    const n = u.match(/^(\d+)(?![A-Z])/);
    if (n) return Number(n[1]);
    if (u.startsWith('LAST')) return 31;
    const ord = ['1ST', '2ND', '3RD', '4TH', '5TH'].findIndex((o) => u.startsWith(o));
    return ord >= 0 ? ord * 7 + 4 : 32;
  };
  if (r.kind === 'monthly' || r.kind === 'quarterly') return dayOf(r.rule);
  if (r.kind === 'weekly') return r.days.length ? Math.min(...r.days) + 1 : 32;
  if (r.kind === 'annual') {
    const [m, d] = r.date.split('-').map(Number);
    return m * 100 + d;
  }
  if (l.date) return Number(l.date.replace(/-/g, ''));
  return Number.MAX_SAFE_INTEGER;
}

/**
 * What lands in a month: monthly lines, quarterly lines in their months, annual lines only in
 * their month, one-offs dated that month. Variable lines, and fixed lines with no date, are a
 * monthly allotment that shows every month.
 */
export function monthLines(lines: BudgetLine[], expenses: Expense[], month: string): MonthLine[] {
  const out: MonthLine[] = [];
  for (const l of lines) {
    const amt = l.amount ?? 0;
    const spent = spentIn(expenses, month, l.id);
    const rep = lineRepeat(l);
    if (rep.kind === 'none' && (l.section === 'variable' || (l.section === 'fixed' && !l.date))) {
      out.push({ line: l, dates: [], due: amt, spent });
      continue;
    }
    const dates = rep.kind !== 'none' ? daysIn(month, (d) => repeatOn(rep, d)) : l.date && monthKey(l.date) === month ? [l.date] : [];
    if (dates.length || spent) out.push({ line: l, dates, due: amt * dates.length, spent });
  }
  return out.sort((a, b) => (a.dates[0] ?? '9999').localeCompare(b.dates[0] ?? '9999') || a.line.sort - b.line.sort);
}
