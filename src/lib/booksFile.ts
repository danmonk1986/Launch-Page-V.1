/**
 * V20-458 (Dan, Nov 22): THE BOOKS FILE. One workbook for a Books tester to start from their own data:
 * BUDGET · EXPENSES · INCOME tabs, the same columns as the Launch Sheet / Records exports, so anything exported
 * (or pasted in from a sheet they already keep) imports straight back. Also reads a single tab saved as .csv.
 *
 * V20-459 (Dan, Nov 22): ONE LAUNCH SHEET. The export IS the import file, so a person can work in Sheets, Excel or
 * Numbers, import, keep going in the app, export and carry on: LINES (the cash book, one row per money movement,
 * the layout of Dan's FY2026 RECORDS sheet) + BUDGET. EXPENSES / INCOME / BY MONTH come out as views of LINES and
 * are never read back when a LINES tab is there. The blank file is the same sheet with no rows.
 */
import { buildXlsx, type SheetSpec } from './xlsx';
import { readXlsx, serialToIso } from './xlsxRead';
import { BUDGET_COLUMNS, budgetRows, linesFromRows, parseCsv, type BudgetLine } from './budget';
import type { Expense } from './expenses';
import { merchantKey, type BankAccount, type BankLine, type Draw, type Route } from './bank';

export const EXPENSE_COLUMNS = ['Date', 'Division', 'Description', 'Method', 'Type', 'Category', 'Payment category', 'Amount (CAD)', 'GST/HST', 'Foreign', 'Currency', 'Notes'];
export const INCOME_COLUMNS = ['Date', 'Project', 'From', 'Account', 'Amount (CAD)', 'GST/HST', 'Notes'];

export const LINES_COLUMNS = ['Date', 'Account', 'Bank text', 'Goes to', 'Division', 'Description', 'Type', 'Group', 'Category', 'Amount', 'GST', 'Notes', 'Debit', 'Credit', 'Balance', 'FP'];
const GOES_TO: Record<Route, string> = { expense: 'Expense', draw: 'Draw', income: 'Income', transfer: 'Transfer', personal: 'Personal', interest: 'Interest' };
const LINES_NOTE = 'One row per money movement. Goes to: Expense, Personal, Draw, Transfer, Income or Interest. Amount in dollars (a refund is negative). Leave FP as it is: it stops a line being imported twice.';

/** The blank Launch Sheet: LINES + BUDGET, headers only. */
export function blankBooksFile(colors: { purple: string; teal: string }): Blob {
  return buildXlsx(
    [
      { name: 'LINES', top: [{ text: 'LAUNCH SHEET · LINES', style: 'title' }, { text: LINES_NOTE, style: 'note' }], headers: LINES_COLUMNS, rows: [] },
      { name: 'BUDGET', top: [{ text: 'LAUNCH SHEET · BUDGET', style: 'title' }, { text: 'One line per bill or cost. Section: fixed, variable, annual or planned. Repeat: e.g. 1st, Feb 28, Mon, Thu.', style: 'note' }], headers: BUDGET_COLUMNS, rows: [] }
    ],
    colors
  );
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

// ---------- LINES: the cash book (V20-459) ----------

export type SheetLines = { accounts: BankAccount[]; lines: BankLine[]; expenses: Expense[]; draws: Draw[]; opening: { start: string; opening: number } | null };
const GOES: Record<string, Route> = { EXPENSE: 'expense', DRAW: 'draw', INCOME: 'income', TRANSFER: 'transfer', PERSONAL: 'personal', INTEREST: 'interest' };
const r2 = (n: number) => Math.round(n * 100) / 100;
function kindOf(name: string): BankAccount['kind'] {
  const n = name.trim().toUpperCase();
  if (/\b(MC|CARD|VISA|MASTERCARD|AMEX)\b/.test(n)) return 'card';
  const last = n.split(/\s+/).pop() ?? '';
  if (/^(SAV|BS$|PS$)/.test(last) || last.endsWith('SAVINGS')) return 'savings';
  return last.startsWith('P') ? 'personal' : 'business';
}

/**
 * Reads a LINES tab: each row becomes a bank line routed by Goes to, and the expense / draw / money-in it makes.
 * Split charges (rows whose Bank text starts ↳, FP ending #part1, #part2…) become one bank line with parts.
 * Rows without an FP (typed in a spreadsheet) get one, so exporting and importing again changes nothing.
 * FP exp|<id> / draw|<id>: an expense or draw that was typed in the app (no bank line), exported and coming back.
 */
export function linesFromSheet(rows: string[][]): SheetLines {
  const out: SheetLines = { accounts: [], lines: [], expenses: [], draws: [], opening: null };
  const t = table(rows, ['DATE', 'GOES TO']);
  if (!t) return out;
  const C = {
    date: t.col('DATE'),
    account: t.col('ACCOUNT'),
    text: t.col('BANK TEXT'),
    goes: t.col('GOES TO'),
    project: t.col('DIVISION', 'PROJECT'),
    desc: t.col('DESCRIPTION'),
    type: t.col('TYPE'),
    group: t.col('GROUP', 'EXPENSE CATEGORY', 'BUDGET GROUP'),
    category: t.col('CATEGORY', 'PAYMENT CATEGORY', 'PMT CATEGORY'),
    amount: t.col('AMOUNT', 'AMOUNT (CAD)'),
    gst: t.col('GST', 'GST/HST'),
    notes: t.col('NOTES'),
    debit: t.col('DEBIT'),
    credit: t.col('CREDIT'),
    balance: t.col('BALANCE'),
    fp: t.col('FP')
  };
  type Row = { date: string; route: Route; name: string; account: string; text: string; project: string; desc: string; type: string; group: string; category: string; amount: number; gst: number | null; notes: string; debit: number | null; credit: number | null; balance: number | null; fp: string };
  const groups = new Map<string, Row[]>();
  const seen = new Map<string, number>();
  for (const r of t.body) {
    const date = dateOf(t.at(r, C.date));
    const route = GOES[key(t.at(r, C.goes))];
    if (!date || !route) continue;
    let debit = amountOf(t.at(r, C.debit));
    let credit = amountOf(t.at(r, C.credit));
    const typed = amountOf(t.at(r, C.amount));
    if (debit === null && credit === null) {
      if (typed === null) continue;
      if (route === 'income' || route === 'interest' ? typed >= 0 : typed < 0) credit = Math.abs(typed);
      else debit = Math.abs(typed);
    }
    const name = t.at(r, C.account);
    const desc = t.at(r, C.desc);
    const raw = t.at(r, C.text);
    const fpCell = t.at(r, C.fp);
    // Only a split part's own ending comes off (#part2); a merchant's # (STORE #3640) is part of the FP.
    let fp = fpCell.replace(/#part\d+$/i, '');
    const parts = fp.split('|');
    const text = (parts.length >= 7 ? parts[5] : raw.replace(/^↳\s*/, '')) || desc || name;
    const account = parts.length >= 7 ? parts[0] : name || 'CASH';
    if (!fp) {
      const b = ['sheet', account, date, debit ?? '', credit ?? '', text.replace(/\s+/g, ' ')].join('|');
      const nth = (seen.get(b) ?? 0) + 1;
      seen.set(b, nth);
      fp = `${b}|${nth}`;
    }
    const amount = typed ?? (debit !== null ? debit : -(credit ?? 0));
    const row: Row = { date, route, name, account, text, project: t.at(r, C.project), desc, type: t.at(r, C.type).toUpperCase(), group: t.at(r, C.group).toUpperCase(), category: t.at(r, C.category).toUpperCase(), amount, gst: amountOf(t.at(r, C.gst)), notes: t.at(r, C.notes), debit, credit, balance: amountOf(t.at(r, C.balance)), fp };
    // Split parts share the line's FP; anything else with an FP already taken is a copy (kept as its own line).
    const split = /#part\d+$/i.test(fpCell) || /^↳/.test(raw);
    if (groups.has(fp) && !split) {
      fp = `${fp}|copy${groups.size}`;
      row.fp = fp;
    }
    groups.set(fp, [...(groups.get(fp) ?? []), row]);
  }
  const expense = (x: Row, sort: number): Expense => ({
    id: crypto.randomUUID(),
    project: x.project,
    date: x.date,
    description: x.desc || x.text,
    method: x.name,
    type: x.type,
    category: x.group,
    pmtCategory: x.category,
    amount: r2(x.amount),
    gst: x.gst === null ? null : r2(x.gst),
    notes: x.notes,
    budgetLineId: null,
    taskId: null,
    sort
  });
  for (const [fp, g] of groups) {
    const m = g[0];
    const ownId = fp.match(/^(exp|draw)\|(.+)$/);
    const line: BankLine = { id: crypto.randomUUID(), account: m.account, date: m.date, kind: m.credit !== null ? 'Credit' : 'Debit', text: m.text, debit: m.debit, credit: m.credit, balance: m.balance, fp, key: merchantKey(m.text), route: m.route, expenseId: null, drawId: null, invoiceId: null, sort: out.lines.length };
    if (m.route === 'expense') {
      const e = expense(m, out.expenses.length);
      if (ownId?.[1] === 'exp') e.id = ownId[2];
      out.expenses.push(e);
      line.expenseId = e.id;
    } else if (m.route === 'draw') {
      const d: Draw = { id: ownId?.[1] === 'draw' ? ownId[2] : crypto.randomUUID(), project: m.project, date: m.date, description: m.desc || m.text, amount: r2(m.amount), notes: m.notes, bankLineId: line.id, sort: out.draws.length };
      out.draws.push(d);
      line.drawId = d.id;
    } else if (m.route === 'income' || m.route === 'interest') {
      line.income = { project: m.project, description: m.desc || m.text, gst: m.route === 'income' ? r2(m.gst ?? 0) : 0, notes: m.notes };
    }
    if (g.length > 1) {
      line.parts = g.slice(1).map((x) => {
        const e = x.route === 'expense' ? expense(x, out.expenses.length) : null;
        if (e) out.expenses.push(e);
        return { route: e ? ('expense' as const) : ('personal' as const), amount: r2(x.amount), expenseId: e?.id ?? null, project: x.project, description: x.desc || x.text };
      });
    }
    out.lines.push(line);
    if (!out.accounts.some((a) => a.number === m.account) && m.account !== 'CASH' && !ownId) {
      out.accounts.push({ id: crypto.randomUUID(), number: m.account, name: m.name || m.account, method: m.name, kind: kindOf(m.name || m.account), sort: out.accounts.length });
    }
  }
  // Opening balance: what each business / savings account held before its first line, added up (cards owe, and a
  // personal account isn't the business's cash).
  let start = '';
  let opening = 0;
  let any = false;
  for (const a of out.accounts.filter((x) => x.kind === 'business' || x.kind === 'savings')) {
    const first = out.lines.filter((l) => l.account === a.number && l.balance !== null).sort((x, y) => x.date.localeCompare(y.date) || x.sort - y.sort)[0];
    if (!first) continue;
    any = true;
    opening += (first.balance ?? 0) - (first.credit ?? 0) + (first.debit ?? 0);
    if (!start || first.date < start) start = first.date;
  }
  if (any) out.opening = { start: start.slice(0, 7), opening: r2(opening) };
  return out;
}

/** The Launch Sheet: LINES + BUDGET to edit, EXPENSES / INCOME / BY MONTH to look at (worked out from LINES). */
export function launchSheetFile(
  d: { lines: BankLine[]; expenses: Expense[]; draws: Draw[]; accounts: BankAccount[]; budget: BudgetLine[] },
  colors: { purple: string; teal: string },
  title = 'LAUNCH SHEET'
): Blob {
  const acct = (n: string) => d.accounts.find((a) => a.number === n);
  const exp = new Map(d.expenses.map((e) => [e.id, e]));
  const drw = new Map(d.draws.map((x) => [x.id, x]));
  const num = (n: number | null | undefined) => (n == null ? '' : r2(n));
  const rows: { date: string; cells: (string | number)[] }[] = [];
  const used = new Set<string>();
  for (const l of d.lines) {
    const e = l.expenseId ? exp.get(l.expenseId) : undefined;
    const w = l.drawId ? drw.get(l.drawId) : undefined;
    if (e) used.add(e.id);
    if (w) used.add(w.id);
    const name = acct(l.account)?.name || l.account;
    const total = l.debit ?? -(l.credit ?? 0);
    const partsSum = (l.parts ?? []).reduce((a, x) => a + x.amount, 0);
    const amount = e?.amount ?? w?.amount ?? (l.parts?.length ? total - partsSum : total);
    const base = (route: Route, x: { project: string; description: string; type?: string; category?: string; pmtCategory?: string; amount: number | null; gst?: number | null; notes?: string }, text: string, fp: string) => [
      l.date, name, text, GOES_TO[route], x.project, x.description, x.type ?? '', x.category ?? '', x.pmtCategory ?? '', num(x.amount), num(x.gst), x.notes ?? '', num(l.debit), num(l.credit), num(l.balance), fp
    ];
    const main = e ?? w ?? { project: l.income?.project ?? '', description: l.income?.description ?? '', amount, gst: l.income?.gst || null, notes: l.income?.notes ?? '' };
    const split = !!l.parts?.length;
    rows.push({ date: l.date, cells: base(l.route, { ...main, amount: e || w ? main.amount : amount }, split ? `↳ ${l.text}` : l.text, split ? `${l.fp}#part1` : l.fp) });
    (l.parts ?? []).forEach((x, i) => {
      const pe = x.expenseId ? exp.get(x.expenseId) : undefined;
      if (pe) used.add(pe.id);
      rows.push({ date: l.date, cells: base(x.route, pe ?? { project: x.project, description: x.description, amount: x.amount }, `↳ ${l.text}`, `${l.fp}#part${i + 2}`) });
    });
  }
  // Typed in the app with no bank line: their own rows, FP exp|id / draw|id, so they come back as themselves.
  for (const e of d.expenses.filter((x) => !used.has(x.id))) {
    rows.push({ date: e.date, cells: [e.date, e.method, '', 'Expense', e.project, e.description, e.type, e.category, e.pmtCategory, num(e.amount), num(e.gst), e.notes, '', '', '', `exp|${e.id}`] });
  }
  for (const w of d.draws.filter((x) => !used.has(x.id))) {
    rows.push({ date: w.date, cells: [w.date, '', '', 'Draw', w.project, w.description, '', '', '', num(w.amount), '', w.notes, '', '', '', `draw|${w.id}`] });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const inc = d.lines.filter((l) => l.route === 'income' || l.route === 'interest');
  const months = new Map<string, { in: number; out: number }>();
  const add = (date: string, k: 'in' | 'out', n: number) => {
    const m = months.get(date.slice(0, 7)) ?? { in: 0, out: 0 };
    m[k] += n;
    months.set(date.slice(0, 7), m);
  };
  for (const l of inc) add(l.date, 'in', l.credit ?? -(l.debit ?? 0));
  for (const e of d.expenses) add(e.date, 'out', e.amount ?? 0);
  const view = 'View only: worked out from LINES. Edit LINES; this tab is not read when the file is imported.';
  const tabs: SheetSpec[] = [
    { name: 'LINES', top: [{ text: `${title} · LINES`, style: 'title' }, { text: LINES_NOTE, style: 'note' }], headers: LINES_COLUMNS, rows: rows.map((r) => r.cells), group: { col: 0, kind: 'month' } },
    { name: 'BUDGET', top: [{ text: `${title} · BUDGET`, style: 'title' }, { text: 'One line per bill or cost. Section: fixed, variable, annual or planned.', style: 'note' }], headers: BUDGET_COLUMNS, rows: budgetRows(d.budget) },
    {
      name: 'EXPENSES',
      top: [{ text: `${title} · EXPENSES`, style: 'title' }, { text: view, style: 'note' }],
      headers: EXPENSE_COLUMNS,
      rows: [...d.expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.project, e.description, e.method, e.type, e.category, e.pmtCategory, num(e.amount), num(e.gst), e.foreign ?? '', e.currency ?? '', e.notes]),
      group: { col: 0, kind: 'month' }
    },
    {
      name: 'INCOME',
      top: [{ text: `${title} · INCOME`, style: 'title' }, { text: view, style: 'note' }],
      headers: INCOME_COLUMNS,
      rows: [...inc].sort((a, b) => a.date.localeCompare(b.date)).map((l) => [l.date, l.income?.project ?? '', l.income?.description || l.text, acct(l.account)?.name || l.account, num(l.credit ?? -(l.debit ?? 0)), num(l.income?.gst), l.income?.notes ?? '']),
      group: { col: 0, kind: 'month' }
    },
    {
      name: 'BY MONTH',
      top: [{ text: `${title} · BY MONTH`, style: 'title' }, { text: view, style: 'note' }],
      headers: ['Month', 'In', 'Out', 'Net'],
      rows: [...months.entries()].sort().map(([m, v]) => [m, r2(v.in), r2(v.out), r2(v.in - v.out)])
    }
  ];
  return buildXlsx(tabs, colors);
}

export type BooksFound = { budget: BudgetLine[]; expenses: Expense[]; income: BankLine[]; sheet: SheetLines | null; tabs: string[] };

/** Reads a books file (.xlsx with BUDGET / EXPENSES / INCOME tabs, or one tab saved as .csv). Other tabs are ignored. */
export async function readBooksFile(file: File): Promise<BooksFound> {
  const found: BooksFound = { budget: [], expenses: [], income: [], sheet: null, tabs: [] };
  const take = (name: string, rows: string[][]) => {
    const n = key(name);
    const has = (h: string) => rows.some((r) => r.some((c) => key(c) === h));
    if (n.startsWith('LINES') || (!n && has('GOES TO'))) {
      const l = linesFromSheet(rows);
      if (l.lines.length) found.tabs.push('Lines');
      found.sheet = l;
    } else if (n.startsWith('BUDGET') || (!n && has('LINE ITEM'))) {
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
    const tabs = await readXlsx(file);
    // A Launch Sheet: LINES is the books; its EXPENSES / INCOME tabs are views of it, so they're not read.
    const hasLines = tabs.some((x) => key(x.name).startsWith('LINES'));
    for (const tab of tabs) if (!hasLines || !/^(EXPENSE|INCOME)/.test(key(tab.name))) take(tab.name, tab.rows);
  } else {
    // A single tab as CSV: told apart by its headers (Line item = Budget; From = Income; else Expenses).
    take('', parseCsv((await file.text()).replace(/^﻿/, '')));
  }
  return found;
}

/** Leaves out what's already in the books (same date, description and amount; budget: same section, item, amount). */
export function newOnly(found: BooksFound, have: { budget: BudgetLine[]; expenses: Expense[]; income: BankLine[]; draws?: Draw[]; accounts?: BankAccount[] }) {
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
  // LINES: a line already here (same FP) is skipped with what it makes; so is an app-typed expense / draw coming back.
  let sheet: SheetLines | null = null;
  let sheetSkipped = 0;
  if (found.sheet) {
    const fps = new Set(have.income.map((l) => l.fp));
    const ids = new Set([...have.expenses.map((e) => e.id), ...(have.draws ?? []).map((w) => w.id)]);
    const lines = found.sheet.lines.filter((l) => !fps.has(l.fp) && !(l.expenseId && ids.has(l.expenseId)) && !(l.drawId && ids.has(l.drawId)));
    const keepE = new Set(lines.flatMap((l) => [l.expenseId, ...(l.parts ?? []).map((x) => x.expenseId)]).filter((x): x is string => !!x));
    const keepD = new Set(lines.map((l) => l.drawId).filter((x): x is string => !!x));
    const knownAcct = new Set((have.accounts ?? []).map((a) => a.number));
    sheet = {
      lines,
      expenses: found.sheet.expenses.filter((e) => keepE.has(e.id)),
      draws: found.sheet.draws.filter((w) => keepD.has(w.id)),
      accounts: found.sheet.accounts.filter((a) => !knownAcct.has(a.number)),
      opening: found.sheet.opening
    };
    sheetSkipped = found.sheet.lines.length - lines.length;
  }
  return { budget, expenses, income, sheet, skipped: found.budget.length + found.expenses.length + found.income.length - budget.length - expenses.length - income.length + sheetSkipped };
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
