/**
 * V20-458 (Dan, Nov 22): THE BOOKS FILE. One workbook for a Books tester to start from their own data:
 * BUDGET · EXPENSES · INCOME tabs, the same columns as the Launch Sheet / Records exports, so anything exported
 * (or pasted in from a sheet they already keep) imports straight back. Also reads a single tab saved as .csv.
 *
 * V20-459 (Dan, Nov 22): ONE LAUNCH SHEET. The export IS the import file, so a person can work in Sheets, Excel or
 * Numbers, import, keep going in the app, export and carry on: LINES (the cash book, one row per money movement,
 * the layout of Dan's FY2026 RECORDS sheet) + BUDGET. EXPENSES / INCOME / BY MONTH come out as views of LINES and
 * are never read back when a LINES tab is there. The blank file is the same sheet with no rows.
 *
 * V20-460 (Dan, Nov 22): every tab, like the FY2026 sheet, and every sorted tab is also a place to drop rows: paste
 * the expenses you keep into EXPENSES, deposits into INCOME… leave FP blank, import, and they're sorted into LINES
 * (and back out into every tab) on the next export. Rows with an FP are copies of LINES and are skipped.
 */
import { buildXlsx, type SheetSpec } from './xlsx';
import { readXlsx, serialToIso } from './xlsxRead';
import { BUDGET_COLUMNS, budgetRows, linesFromRows, parseCsv, type BudgetLine } from './budget';
import type { Expense } from './expenses';
import { invoiceTotals, type Invoice } from './invoices';
import { merchantKey, type BankAccount, type BankLine, type CommonExpense, type Draw, type Route } from './bank';

export const LINES_COLUMNS = ['Date', 'Account', 'Bank text', 'Goes to', 'Division', 'Description', 'Type', 'Group', 'Category', 'Amount', 'GST', 'Notes', 'Debit', 'Credit', 'Balance', 'FP'];
const GOES_TO: Record<Route, string> = { expense: 'Expense', draw: 'Draw', income: 'Income', transfer: 'Transfer', personal: 'Personal', interest: 'Interest' };
const LINES_NOTE = 'One row per money movement. Goes to: Expense, Personal, Draw, Transfer, Income or Interest. Amount in dollars (a refund is negative). Leave FP as it is: it stops a line being imported twice.';

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

// ---------- Every tab is a place to drop rows (V20-460) ----------

/** Where a tab's rows go. LINES rows say it themselves (Goes to); the sorted tabs say it by being that tab. */
type TabKind = 'lines' | 'expense' | 'personal' | 'income' | 'draw';
function tabKind(name: string): TabKind | 'budget' | null {
  const n = key(name);
  if (n.startsWith('LINES')) return 'lines';
  if (n.startsWith('BUDGET')) return 'budget';
  if (n.startsWith('EXPENSE')) return 'expense';
  if (n.startsWith('PERSONAL')) return 'personal';
  if (n.startsWith('INCOME')) return 'income';
  if (n.startsWith('DRAW')) return 'draw';
  return null;
}
const ALIASES: Record<string, string[]> = {
  Date: ['DATE'],
  Account: ['ACCOUNT', 'PMT METHOD', 'METHOD', 'PAYMENT METHOD'],
  'Bank text': ['BANK TEXT'],
  'Goes to': ['GOES TO'],
  Division: ['DIVISION', 'PROJECT'],
  Description: ['DESCRIPTION', 'FROM'],
  Type: ['TYPE', 'PMT TYPE'],
  Amount: ['AMOUNT', 'AMOUNT (CAD)', 'TOTAL $', 'TOTAL'],
  GST: ['GST', 'GST/HST'],
  Notes: ['NOTES'],
  Debit: ['DEBIT'],
  Credit: ['CREDIT'],
  Balance: ['BALANCE'],
  FP: ['FP']
};
/**
 * One tab's rows in LINES order. On a sorted tab (EXPENSES, PERSONAL EXPENSES, INCOME, DRAWS) a row with an FP is
 * a copy of a LINES row and is left out; a row without one is new, and the tab says where it goes.
 */
function asLines(rows: string[][], kind: TabKind): string[][] {
  const t = table(rows, kind === 'lines' ? ['DATE', 'GOES TO'] : ['DATE']);
  if (!t) return [];
  const sorted = kind !== 'lines';
  const cols = LINES_COLUMNS.map((c) => {
    if (c === 'Group') return sorted ? t.col('GROUP', 'EXPENSE CATEGORY', 'BUDGET GROUP', 'CATEGORY') : t.col('GROUP', 'EXPENSE CATEGORY', 'BUDGET GROUP');
    if (c === 'Category') return sorted ? t.col('PMT CATEGORY', 'PAYMENT CATEGORY') : t.col('CATEGORY', 'PMT CATEGORY', 'PAYMENT CATEGORY');
    return t.col(...ALIASES[c]);
  });
  const fpAt = cols[LINES_COLUMNS.indexOf('FP')];
  const goesAt = LINES_COLUMNS.indexOf('Goes to');
  const out: string[][] = [];
  const dateAt = cols[0];
  for (const r of t.body) {
    if (!t.at(r, dateAt) || (sorted && t.at(r, fpAt))) continue;
    const row = cols.map((i) => t.at(r, i));
    if (sorted) row[goesAt] = GOES_TO[kind];
    out.push(row);
  }
  return out;
}

export type BooksFound = { budget: BudgetLine[]; sheet: SheetLines | null; tabs: string[] };

/**
 * Reads a Launch Sheet (.xlsx), or one tab saved as .csv. LINES, EXPENSES, PERSONAL EXPENSES, INCOME and DRAWS all
 * land in the books as lines (so someone can paste each sheet they keep into its own tab); BUDGET as the budget.
 * COMMON EXPENSES, INVOICES, BY MONTH and LISTS are views: not read.
 */
export async function readBooksFile(file: File): Promise<BooksFound> {
  const found: BooksFound = { budget: [], sheet: null, tabs: [] };
  const lineRows: string[][] = [];
  const LABEL: Record<TabKind, string> = { lines: 'Lines', expense: 'Expenses', personal: 'Personal expenses', income: 'Income', draw: 'Draws' };
  const take = (kind: TabKind | 'budget' | null, rows: string[][]) => {
    if (!kind) return;
    if (kind === 'budget') {
      const l = linesFromRows(rows);
      if (l.length) found.tabs.push('Budget');
      found.budget.push(...l);
      return;
    }
    const l = asLines(rows, kind);
    if (l.length) found.tabs.push(LABEL[kind]);
    lineRows.push(...l);
  };
  if (/\.xlsx$/i.test(file.name)) {
    for (const tab of await readXlsx(file)) take(tabKind(tab.name), tab.rows);
  } else {
    // One tab as CSV, told apart by its headers.
    const rows = parseCsv((await file.text()).replace(/^﻿/, ''));
    const has = (h: string) => rows.some((r) => r.some((c) => key(c) === h));
    take(has('GOES TO') ? 'lines' : has('LINE ITEM') ? 'budget' : has('FROM') ? 'income' : has('DATE') ? 'expense' : null, rows);
  }
  if (lineRows.length) found.sheet = linesFromSheet([LINES_COLUMNS, ...lineRows]);
  return found;
}

/** Leaves out what's already in the books: lines by FP (with what they make), budget by section + item + amount. */
export function newOnly(found: BooksFound, have: { budget: BudgetLine[]; expenses: Expense[]; lines: BankLine[]; draws: Draw[]; accounts: BankAccount[] }) {
  const amt = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));
  const bk = (l: BudgetLine) => `${l.section}|${l.description.trim().toLowerCase()}|${amt(l.amount)}`;
  const seenB = new Set(have.budget.map(bk));
  const budget = found.budget.filter((x) => (seenB.has(bk(x)) ? false : (seenB.add(bk(x)), true)));
  let sheet: SheetLines | null = null;
  let skipped = found.budget.length - budget.length;
  if (found.sheet) {
    const fps = new Set(have.lines.map((l) => l.fp));
    const ids = new Set([...have.expenses.map((e) => e.id), ...have.draws.map((w) => w.id)]);
    const lines = found.sheet.lines.filter((l) => !fps.has(l.fp) && !(l.expenseId && ids.has(l.expenseId)) && !(l.drawId && ids.has(l.drawId)));
    const known = new Set(have.accounts.map((a) => a.number));
    // V20-490 (Dan, Nov 23): a spreadsheet names its accounts in words ("ATB P", "MC", "ATB B"); match each to an account
    // you already have instead of making a new one: the same name or pmt method (punctuation aside), the end of one
    // ("MC" → "ATB MC"), or the only account of that kind (personal / card / business).
    const sq = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const matchFor = (a: BankAccount): BankAccount | null => {
      const n = sq(a.name || a.number);
      if (!n) return null;
      const same = have.accounts.filter((x) => [x.method, x.name, x.number].some((v) => !!v && sq(v) === n));
      if (same.length === 1) return same[0];
      const ends = have.accounts.filter((x) => n.length >= 2 && [x.method, x.name].some((v) => !!v && sq(v).endsWith(n)));
      if (ends.length === 1) return ends[0];
      const kind = have.accounts.filter((x) => x.kind === a.kind);
      return kind.length === 1 ? kind[0] : null;
    };
    const moveTo = new Map<string, string>();
    for (const a of found.sheet.accounts) {
      if (known.has(a.number)) continue;
      const m = matchFor(a);
      if (m) moveTo.set(a.number, m.number);
    }
    for (const l of lines) l.account = moveTo.get(l.account) ?? l.account;
    // V20-539 → 541 (Dan, Nov 26): no silent skipping by date and amount (four rounds at the Stampede are four real
    // charges): lines go to the import's review, where a maybe-here line is flagged and left out until you tick it.
    const keepE = new Set(lines.flatMap((l) => [l.expenseId, ...(l.parts ?? []).map((x) => x.expenseId)]).filter((x): x is string => !!x));
    const keepD = new Set(lines.map((l) => l.drawId).filter((x): x is string => !!x));
    const used = new Set(lines.map((l) => l.account));
    sheet = {
      lines,
      expenses: found.sheet.expenses.filter((e) => keepE.has(e.id)),
      draws: found.sheet.draws.filter((w) => keepD.has(w.id)),
      accounts: found.sheet.accounts.filter((a) => !known.has(a.number) && used.has(a.number)),
      opening: found.sheet.opening
    };
    skipped += found.sheet.lines.length - lines.length;
  }
  return { budget, sheet, skipped };
}

// ---------- The Launch Sheet out (V20-459 / 460) ----------

const EXPENSES_TAB = ['Date', 'Division', 'Description', 'Pmt method', 'Pmt type', 'Expense category', 'Pmt category', 'Amount', 'GST', 'Notes', 'FP'];
const PERSONAL_TAB = ['Date', 'Account', 'Division', 'Description', 'Amount', 'Notes', 'FP'];
const INCOME_TAB = ['Date', 'Account', 'Division', 'From', 'Amount', 'GST', 'Notes', 'FP'];
const DRAWS_TAB = ['Date', 'Account', 'Division', 'Description', 'Amount', 'Notes', 'FP'];
const SORTED_NOTE = (what: string) => `${what}, sorted from LINES. Add a new one here with the FP left blank and it's added on import; rows with an FP are copies of LINES (edit LINES).`;
const VIEW_NOTE = 'View only: worked out from your books. Not read on import.';

export type LaunchSheetData = { lines: BankLine[]; expenses: Expense[]; draws: Draw[]; accounts: BankAccount[]; budget: BudgetLine[]; common?: CommonExpense[]; invoices?: Invoice[] };

/**
 * The Launch Sheet, the same tabs as the FY2026 RECORDS sheet: LINES (everything) · BUDGET · COMMON EXPENSES ·
 * EXPENSES · PERSONAL EXPENSES · INCOME · DRAWS · INVOICES · BY MONTH · LISTS. Every sorted row carries its FP.
 * With no data it's the blank file.
 */
export function launchSheetFile(d: LaunchSheetData, colors: { purple: string; teal: string }, title = 'LAUNCH SHEET'): Blob {
  const acct = (n: string) => d.accounts.find((a) => a.number === n)?.name || n;
  const exp = new Map(d.expenses.map((e) => [e.id, e]));
  const drw = new Map(d.draws.map((x) => [x.id, x]));
  const num = (n: number | null | undefined) => (n == null ? '' : r2(n));
  const byDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date));
  const lines: { date: string; cells: (string | number)[] }[] = [];
  const fpOf = new Map<string, string>(); // expense / draw id → the FP of its LINES row
  const personal: { date: string; cells: (string | number)[] }[] = [];
  const used = new Set<string>();
  for (const l of byDate(d.lines)) {
    const e = l.expenseId ? exp.get(l.expenseId) : undefined;
    const w = l.drawId ? drw.get(l.drawId) : undefined;
    const name = acct(l.account);
    const total = l.debit ?? -(l.credit ?? 0);
    const split = !!l.parts?.length;
    const mainAmount = e?.amount ?? w?.amount ?? (split ? r2(total - (l.parts ?? []).reduce((a, x) => a + x.amount, 0)) : total);
    const row = (route: Route, x: { project: string; description: string; type?: string; category?: string; pmtCategory?: string; amount: number | null; gst?: number | null; notes?: string }, fp: string) => {
      lines.push({ date: l.date, cells: [l.date, name, split ? `↳ ${l.text}` : l.text, GOES_TO[route], x.project, x.description, x.type ?? '', x.category ?? '', x.pmtCategory ?? '', num(x.amount), num(x.gst), x.notes ?? '', num(l.debit), num(l.credit), num(l.balance), fp] });
      if (route === 'personal') personal.push({ date: l.date, cells: [l.date, name, x.project, x.description || l.text, num(x.amount), x.notes ?? '', fp] });
    };
    const fp1 = split ? `${l.fp}#part1` : l.fp;
    const main = e ?? w ?? { project: l.income?.project ?? '', description: l.income?.description ?? '', amount: mainAmount, gst: l.income?.gst || null, notes: l.income?.notes ?? '' };
    row(l.route, { ...main, amount: e || w ? main.amount : mainAmount }, fp1);
    for (const x of [e, w]) {
      if (!x) continue;
      fpOf.set(x.id, fp1);
      used.add(x.id);
    }
    (l.parts ?? []).forEach((x, i) => {
      const pe = x.expenseId ? exp.get(x.expenseId) : undefined;
      const fp = `${l.fp}#part${i + 2}`;
      if (pe) {
        fpOf.set(pe.id, fp);
        used.add(pe.id);
      }
      row(x.route, pe ?? { project: x.project, description: x.description, amount: x.amount }, fp);
    });
  }
  // Typed in the app with no bank line: their own rows, FP exp|id / draw|id, so they come back as themselves.
  for (const e of d.expenses.filter((x) => !used.has(x.id))) {
    fpOf.set(e.id, `exp|${e.id}`);
    lines.push({ date: e.date, cells: [e.date, e.method, '', 'Expense', e.project, e.description, e.type, e.category, e.pmtCategory, num(e.amount), num(e.gst), e.notes, '', '', '', `exp|${e.id}`] });
  }
  for (const w of d.draws.filter((x) => !used.has(x.id))) {
    fpOf.set(w.id, `draw|${w.id}`);
    lines.push({ date: w.date, cells: [w.date, '', '', 'Draw', w.project, w.description, '', '', '', num(w.amount), '', w.notes, '', '', '', `draw|${w.id}`] });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  personal.sort((a, b) => a.date.localeCompare(b.date));
  const inc = byDate(d.lines.filter((l) => l.route === 'income' || l.route === 'interest'));
  const drawLine = new Map(d.lines.filter((l) => l.drawId).map((l) => [l.drawId!, l]));

  const months = new Map<string, { in: number; out: number; personal: number; draws: number }>();
  const add = (date: string, k: 'in' | 'out' | 'personal' | 'draws', n: number) => {
    const m = months.get(date.slice(0, 7)) ?? { in: 0, out: 0, personal: 0, draws: 0 };
    m[k] += n;
    months.set(date.slice(0, 7), m);
  };
  for (const l of inc) add(l.date, 'in', l.credit ?? -(l.debit ?? 0));
  for (const e of d.expenses) add(e.date, 'out', e.amount ?? 0);
  for (const w of d.draws) add(w.date, 'draws', w.amount);
  for (const p of personal) add(p.date, 'personal', Number(p.cells[4]) || 0);

  // LISTS: the values each column uses (drop-downs to copy from).
  const distinct = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort();
  const lists = [
    Object.values(GOES_TO),
    distinct([...d.expenses.map((e) => e.type), ...d.budget.map((b) => b.type)]),
    distinct([...d.expenses.map((e) => e.category), ...d.budget.map((b) => b.category)]),
    distinct([...d.expenses.map((e) => e.pmtCategory), ...d.budget.map((b) => b.pmtCategory)]),
    distinct([...d.expenses.map((e) => e.project), ...d.draws.map((w) => w.project), ...inc.map((l) => l.income?.project ?? '')]),
    distinct(d.accounts.map((a) => a.name))
  ];
  const listRows = Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) => lists.map((l) => l[i] ?? ''));

  const top = (name: string, note: string) => [{ text: `${title} · ${name}`, style: 'title' as const }, { text: note, style: 'note' as const }];
  const month = { col: 0, kind: 'month' as const };
  const tabs: SheetSpec[] = [
    { name: 'LINES', top: top('LINES', LINES_NOTE), headers: LINES_COLUMNS, rows: lines.map((r) => r.cells), group: month },
    { name: 'BUDGET', top: top('BUDGET', 'One line per bill or cost. Section: fixed, variable, annual or planned. Repeat: e.g. 1st, Feb 28, Mon, Thu.'), headers: BUDGET_COLUMNS, rows: budgetRows(d.budget) },
    {
      name: 'COMMON EXPENSES',
      top: top('COMMON EXPENSES', `How each merchant is written up. ${VIEW_NOTE}`),
      headers: ['Division', 'Description', 'Goes to', 'Type', 'Group', 'Category', 'Last used', 'Amount'],
      rows: [...(d.common ?? [])].sort((a, b) => a.description.localeCompare(b.description)).map((c) => [c.project, c.description, GOES_TO[c.route], c.type, c.category, c.pmtCategory, c.lastDate, num(c.amount)])
    },
    {
      name: 'EXPENSES',
      top: top('EXPENSES', SORTED_NOTE('Business expenses')),
      headers: EXPENSES_TAB,
      rows: byDate(d.expenses).map((e) => [e.date, e.project, e.description, e.method, e.type, e.category, e.pmtCategory, num(e.amount), num(e.gst), e.notes, fpOf.get(e.id) ?? '']),
      group: month
    },
    { name: 'PERSONAL EXPENSES', top: top('PERSONAL EXPENSES', SORTED_NOTE('Personal spending')), headers: PERSONAL_TAB, rows: personal.map((r) => r.cells), group: month },
    {
      name: 'INCOME',
      top: top('INCOME', SORTED_NOTE('Money in')),
      headers: INCOME_TAB,
      rows: inc.map((l) => [l.date, acct(l.account), l.income?.project ?? '', l.income?.description || l.text, num(l.credit ?? -(l.debit ?? 0)), num(l.income?.gst), l.income?.notes ?? '', l.fp]),
      group: month
    },
    {
      name: 'DRAWS',
      top: top('DRAWS', SORTED_NOTE('Money taken out of the business')),
      headers: DRAWS_TAB,
      rows: byDate(d.draws).map((w) => [w.date, drawLine.get(w.id) ? acct(drawLine.get(w.id)!.account) : '', w.project, w.description, num(w.amount), w.notes, fpOf.get(w.id) ?? '']),
      group: month
    },
    {
      name: 'INVOICES',
      top: top('INVOICES', VIEW_NOTE),
      headers: ['Invoice #', 'Start', 'End', 'Description', 'Total', 'GST', 'Sub total', 'Date paid', 'Notes'],
      rows: [...(d.invoices ?? [])].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')).map((i) => {
        const t = invoiceTotals(i);
        return [i.number, i.start ?? '', i.end ?? '', i.description, t.total, t.gst, t.subTotal, i.datePaid ?? '', i.notes];
      })
    },
    {
      name: 'BY MONTH',
      top: top('BY MONTH', VIEW_NOTE),
      headers: ['Month', 'In', 'Expenses', 'Net (in − expenses)', 'Personal', 'Draws'],
      rows: [...months.entries()].sort().map(([m, v]) => [m, r2(v.in), r2(v.out), r2(v.in - v.out), r2(v.personal), r2(v.draws)])
    },
    { name: 'LISTS', top: top('LISTS', 'The values each column uses, to copy from.'), headers: ['Goes to', 'Type', 'Group', 'Category', 'Division', 'Account'], rows: listRows }
  ];
  return buildXlsx(tabs, colors);
}

/** The blank Launch Sheet: every tab, headers only. */
export const blankBooksFile = (colors: { purple: string; teal: string }) => launchSheetFile({ lines: [], expenses: [], draws: [], accounts: [], budget: [] }, colors);

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
