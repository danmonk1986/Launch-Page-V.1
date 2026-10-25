import { makeStore } from './store';
import type { BudgetLine } from './budget';

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
    sort: e.sort
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
    sort: r.sort ?? 0
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
