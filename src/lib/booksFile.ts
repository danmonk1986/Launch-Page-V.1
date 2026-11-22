/**
 * V20-458 (Dan, Nov 22): THE BOOKS FILE. One workbook for a Books tester to start from their own data:
 * BUDGET · EXPENSES · INCOME tabs, the same columns as the Launch Sheet / Records exports, so anything exported
 * (or pasted in from a sheet they already keep) imports straight back. Also reads a single tab saved as .csv.
 */
import { buildXlsx, type SheetSpec } from './xlsx';
import { readXlsx, serialToIso } from './xlsxRead';
import { BUDGET_COLUMNS, linesFromRows, parseCsv, type BudgetLine } from './budget';
import type { Expense } from './expenses';
import type { BankLine } from './bank';

export const EXPENSE_COLUMNS = ['Date', 'Division', 'Description', 'Method', 'Type', 'Category', 'Payment category', 'Amount (CAD)', 'GST/HST', 'Foreign', 'Currency', 'Notes'];
export const INCOME_COLUMNS = ['Date', 'Project', 'From', 'Account', 'Amount (CAD)', 'GST/HST', 'Notes'];

/** The blank books file: three tabs, headers only. */
export function blankBooksFile(colors: { purple: string; teal: string }): Blob {
  const note = (text: string) => ({ text, style: 'note' as const });
  const tabs: SheetSpec[] = [
    {
      name: 'BUDGET',
      top: [{ text: 'BOOKS · Budget', style: 'title' }, note('One line per bill or cost. Section: fixed, variable, annual or planned. Repeat: e.g. 1st, Feb 28, Mon, Thu.')],
      headers: BUDGET_COLUMNS,
      rows: []
    },
    {
      name: 'EXPENSES',
      top: [{ text: 'BOOKS · Expenses', style: 'title' }, note('What was actually paid, one line each. Date as yyyy-mm-dd or m/d/yyyy; amount in dollars.')],
      headers: EXPENSE_COLUMNS,
      rows: []
    },
    {
      name: 'INCOME',
      top: [{ text: 'BOOKS · Income', style: 'title' }, note('Money in, one line per deposit. From = who paid you; Account = the bank account it went into.')],
      headers: INCOME_COLUMNS,
      rows: []
    }
  ];
  return buildXlsx(tabs, colors);
}

const key = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();
const isError = (v: string) => /^#(VALUE|REF|N\/A|DIV\/0|ERROR|NAME|NUM|NULL)[!?]?$/i.test(v);
function dateOf(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return serialToIso(t);
}
function amountOf(v: string): number | null {
  const s = v.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return s && /^-?\d*\.?\d+$/.test(s) ? Number(s) : null;
}
/** Finds the header row (it holds every one of `need`) and the column of each name. */
function table(rows: string[][], need: string[]) {
  const head = rows.findIndex((r) => need.every((n) => r.some((c) => key(c) === n)));
  if (head < 0) return null;
  const h = rows[head].map(key);
  const col = (...names: string[]) => h.findIndex((c) => names.includes(c));
  const at = (r: string[], i: number) => {
    const v = i >= 0 ? (r[i] ?? '').trim() : '';
    return isError(v) ? '' : v;
  };
  return { body: rows.slice(head + 1), col, at };
}

export function expensesFromRows(rows: string[][]): Expense[] {
  const t = table(rows, ['DATE', 'DESCRIPTION']);
  if (!t) return [];
  const C = {
    date: t.col('DATE'),
    project: t.col('DIVISION', 'PROJECT'),
    desc: t.col('DESCRIPTION'),
    method: t.col('METHOD', 'PMT METHOD', 'PAYMENT METHOD'),
    type: t.col('TYPE', 'PMT TYPE'),
    category: t.col('CATEGORY', 'BUDGET GROUP', 'BUDGET CATEGORY'),
    pmtCategory: t.col('PAYMENT CATEGORY', 'PMT CATEGORY'),
    amount: t.col('AMOUNT (CAD)', 'AMOUNT', 'TOTAL $', 'TOTAL'),
    gst: t.col('GST/HST', 'GST'),
    foreign: t.col('FOREIGN'),
    currency: t.col('CURRENCY'),
    notes: t.col('NOTES')
  };
  const out: Expense[] = [];
  for (const r of t.body) {
    const date = dateOf(t.at(r, C.date));
    const description = t.at(r, C.desc);
    if (!date || !description) continue;
    const foreign = amountOf(t.at(r, C.foreign));
    out.push({
      id: crypto.randomUUID(),
      project: t.at(r, C.project),
      date,
      description,
      method: t.at(r, C.method),
      type: t.at(r, C.type).toUpperCase(),
      category: t.at(r, C.category).toUpperCase(),
      pmtCategory: t.at(r, C.pmtCategory).toUpperCase(),
      amount: amountOf(t.at(r, C.amount)),
      gst: amountOf(t.at(r, C.gst)),
      notes: t.at(r, C.notes),
      budgetLineId: null,
      taskId: null,
      sort: out.length,
      ...(foreign !== null && t.at(r, C.currency) ? { foreign, currency: t.at(r, C.currency).toUpperCase() } : {})
    });
  }
  return out;
}

/** Money in from a file: saved like a bank deposit (route income), so the Income card and Cash Book count it. */
export function incomeFromRows(rows: string[][]): BankLine[] {
  const t = table(rows, ['DATE', 'FROM']);
  if (!t) return [];
  const C = {
    date: t.col('DATE'),
    project: t.col('PROJECT', 'DIVISION'),
    from: t.col('FROM', 'DESCRIPTION'),
    account: t.col('ACCOUNT'),
    amount: t.col('AMOUNT (CAD)', 'AMOUNT', 'TOTAL'),
    gst: t.col('GST/HST', 'GST'),
    notes: t.col('NOTES')
  };
  const out: BankLine[] = [];
  for (const r of t.body) {
    const date = dateOf(t.at(r, C.date));
    const from = t.at(r, C.from);
    const amount = amountOf(t.at(r, C.amount));
    if (!date || !from || amount === null) continue;
    const account = t.at(r, C.account) || 'FROM FILE';
    out.push({
      id: crypto.randomUUID(),
      account,
      date,
      kind: 'Deposit',
      text: from,
      debit: null,
      credit: amount,
      balance: null,
      fp: `file|${account}|${date}|${from.toLowerCase()}|${amount.toFixed(2)}`,
      key: from.toUpperCase(),
      route: 'income',
      expenseId: null,
      drawId: null,
      invoiceId: null,
      income: { project: t.at(r, C.project), description: from, gst: amountOf(t.at(r, C.gst)) ?? 0, notes: t.at(r, C.notes) },
      sort: out.length
    });
  }
  return out;
}

export type BooksFound = { budget: BudgetLine[]; expenses: Expense[]; income: BankLine[]; tabs: string[] };

/** Reads a books file (.xlsx with BUDGET / EXPENSES / INCOME tabs, or one tab saved as .csv). Other tabs are ignored. */
export async function readBooksFile(file: File): Promise<BooksFound> {
  const found: BooksFound = { budget: [], expenses: [], income: [], tabs: [] };
  const take = (name: string, rows: string[][]) => {
    const n = key(name);
    const has = (h: string) => rows.some((r) => r.some((c) => key(c) === h));
    if (n.startsWith('BUDGET') || (!n && has('LINE ITEM'))) {
      const l = linesFromRows(rows);
      if (l.length) found.tabs.push('Budget');
      found.budget.push(...l);
    } else if (n.startsWith('EXPENSE') || (!n && has('DESCRIPTION') && has('DATE'))) {
      const e = expensesFromRows(rows);
      if (e.length) found.tabs.push('Expenses');
      found.expenses.push(...e);
    } else if (n.startsWith('INCOME') || (!n && has('FROM') && has('DATE'))) {
      const i = incomeFromRows(rows);
      if (i.length) found.tabs.push('Income');
      found.income.push(...i);
    }
  };
  if (/\.xlsx$/i.test(file.name)) {
    for (const tab of await readXlsx(file)) take(tab.name, tab.rows);
  } else {
    // A single tab as CSV: told apart by its headers (Line item = Budget; From = Income; else Expenses).
    take('', parseCsv((await file.text()).replace(/^﻿/, '')));
  }
  return found;
}

/** Leaves out what's already in the books (same date, description and amount; budget: same section, item, amount). */
export function newOnly(found: BooksFound, have: { budget: BudgetLine[]; expenses: Expense[]; income: BankLine[] }) {
  const amt = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));
  const bk = (l: BudgetLine) => `${l.section}|${l.description.trim().toLowerCase()}|${amt(l.amount)}`;
  const ek = (e: Expense) => `${e.date}|${e.description.trim().toLowerCase()}|${amt(e.amount)}`;
  const ik = (l: BankLine) => `${l.date}|${(l.income?.description || l.text).trim().toLowerCase()}|${amt(l.credit ?? (l.debit != null ? -l.debit : null))}`;
  const seenB = new Set(have.budget.map(bk));
  const seenE = new Set(have.expenses.map(ek));
  const seenI = new Set(have.income.filter((l) => l.route === 'income' || l.route === 'interest').map(ik));
  const pick = <T,>(list: T[], k: (x: T) => string, seen: Set<string>) => list.filter((x) => (seen.has(k(x)) ? false : (seen.add(k(x)), true)));
  const budget = pick(found.budget, bk, seenB);
  const expenses = pick(found.expenses, ek, seenE);
  const income = pick(found.income, ik, seenI);
  return { budget, expenses, income, skipped: found.budget.length + found.expenses.length + found.income.length - budget.length - expenses.length - income.length };
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
