/**
 * Bookkeeping (V20-015, Nov 1): bank statement CSVs → Records.
 *
 * Every line of a statement gets a route: an expense (Records → Expenses), a draw (Records →
 * Draws), income (a client paying an invoice), a transfer between your own accounts (card
 * payments, the personal side of a draw), personal spending, or interest. Common Expenses
 * (expense_rules) is the catalog of how expenses are documented (merchant + purpose) and learns
 * which bank merchant is which, so the next import fills
 * itself in; every line imported is kept (bank_lines), so a statement can be imported twice
 * without doubling anything.
 *
 * ATB's export (same 10 columns for chequing, savings and Mastercard; the business export may come
 * without its header row): Transaction Date, Account Rtn, Account Number, Transaction Type,
 * Customer Reference Number, Debit Amount, Credit Amount, Principal Balance Amount, Extended Text,
 * Bank Reference Number. Other banks get their own layout later.
 *
 * Statements are the user's data: they live in their database, never in this code or the repo.
 */
import { jsonStore, money as cad, type Invoice } from './invoices';
import { invoiceTotals } from './invoices';
import type { Expense } from './expenses';
import type { BudgetLine } from './budget';

export type Route = 'expense' | 'draw' | 'income' | 'transfer' | 'personal' | 'interest';
export const ROUTES: { id: Route; label: string; hint: string }[] = [
  { id: 'expense', label: 'Expense', hint: 'A business expense: goes to Records → Expenses' },
  { id: 'draw', label: 'Draw', hint: 'Money taken out of the business: goes to Records → Draws' },
  { id: 'income', label: 'Income', hint: 'A client paying: marks the matching invoice paid' },
  { id: 'transfer', label: 'Transfer', hint: 'Between your own accounts (card payments, the other side of a draw): not counted' },
  { id: 'personal', label: 'Personal', hint: 'Personal spending: kept out of the books' },
  { id: 'interest', label: 'Interest', hint: 'Interest paid on an account' }
];

export type AccountKind = 'business' | 'personal' | 'card' | 'savings';

export interface BankAccount {
  id: string;
  /** As the statement prints it (cards come masked: 123456******0000). */
  number: string;
  name: string;
  /** PMT METHOD on the expenses it pays: ATB P., ATB MC, ATB B. */
  method: string;
  kind: AccountKind;
  sort: number;
}

export interface BankLine {
  id: string;
  account: string;
  date: string;
  /** Transaction Type: Withdrawal, Payment, EFT, Fee, Interest, Debit, Credit… */
  kind: string;
  text: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  /** Same line, same fingerprint: a statement imported twice adds nothing. */
  fp: string;
  /** The merchant, cleaned (WALMART STORE #3640 WALMART STORE #36 → WALMART STORE). */
  key: string;
  route: Route;
  expenseId: string | null;
  drawId: string | null;
  invoiceId: string | null;
  /** A split charge: the parts beyond the main line (each its own expense, or personal). */
  parts?: { route: Route; amount: number; expenseId: string | null; project: string; description: string }[];
  /** Money in (Nov 1, Records → Income): how a deposit or interest is documented; GST is what it collected. */
  income?: { project: string; description: string; gst: number; notes: string };
  sort: number;
}

/**
 * Common Expenses: the catalog of how expenses are documented, one entry per merchant + purpose
 * ("Players Lounge - Crew Dinner" under MWD, "Players Lounge - Drinks for One" under the owner).
 * Each entry learns the bank merchants it's been confirmed for (keys) and when it was last used,
 * and is saved again (the latest version wins) every time an import confirms it.
 */
export interface CommonExpense {
  id: string;
  /** DIVISION: a business area (MWD, APP SHOP…) or the owner's personal division (Records setup) for personal. */
  project: string;
  /** "Merchant - purpose" */
  description: string;
  type: string;
  category: string;
  pmtCategory: string;
  route: Route;
  /** GST on this spend (5% of the total). null: by payment category (insurance, fees and dues aren't taxed). */
  gst: boolean | null;
  frequency: string;
  /** Bank merchants confirmed for this entry (merchantKey). */
  keys: string[];
  lastDate: string;
  /** The amount it was last confirmed at: a FIXED bill is told apart from others at the same merchant by it (PayPal → Adobe $96.59, Soundcloud $12.99). */
  amount: number | null;
  /** Nov 1: a charge split across divisions (vehicle insurance: SHOP / MWD / personal), remembered as shares of the total. */
  split?: SplitShare[];
  sort: number;
}

/** One part of a split charge. The main line keeps whatever the parts don't cover. */
export interface Part {
  id: string;
  route: 'expense' | 'personal';
  project: string;
  description: string;
  type: string;
  category: string;
  pmtCategory: string;
  amount: number;
  /** GST in this part (worked out from its amount), or none. */
  gst: boolean;
}
export type SplitShare = Omit<Part, 'id' | 'amount'> & { share: number };

export interface Draw {
  id: string;
  project: string;
  date: string;
  description: string;
  amount: number;
  notes: string;
  bankLineId: string | null;
  sort: number;
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const route = (v: unknown): Route => (ROUTES.some((r) => r.id === v) ? (v as Route) : 'personal');

export const bankAccountStore = jsonStore<BankAccount>('bank_accounts', 'launchpage.bank-accounts.v1', (d) => ({
  number: s(d.number),
  name: s(d.name),
  method: s(d.method),
  kind: (['business', 'personal', 'card', 'savings'] as const).includes(d.kind as AccountKind) ? (d.kind as AccountKind) : 'personal'
}));

export const bankLineStore = jsonStore<BankLine>('bank_lines', 'launchpage.bank-lines.v1', (d) => ({
  account: s(d.account),
  date: s(d.date),
  kind: s(d.kind),
  text: s(d.text),
  debit: n(d.debit),
  credit: n(d.credit),
  balance: n(d.balance),
  fp: s(d.fp),
  key: s(d.key),
  route: route(d.route),
  expenseId: s(d.expenseId) || null,
  drawId: s(d.drawId) || null,
  invoiceId: s(d.invoiceId) || null,
  parts: Array.isArray(d.parts) ? (d.parts as BankLine['parts']) : undefined,
  income: d.income && typeof d.income === 'object' ? (d.income as BankLine['income']) : undefined
}));

export const commonStore = jsonStore<CommonExpense>('expense_rules', 'launchpage.expense-rules.v1', (d) => ({
  project: s(d.project),
  description: s(d.description),
  type: s(d.type),
  category: s(d.category),
  pmtCategory: s(d.pmtCategory),
  route: route(d.route ?? 'expense'),
  gst: typeof d.gst === 'boolean' ? d.gst : null,
  frequency: s(d.frequency),
  keys: Array.isArray(d.keys) ? (d.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [],
  lastDate: s(d.lastDate),
  amount: n(d.amount),
  split: Array.isArray(d.split) ? (d.split as SplitShare[]).filter((x) => x && typeof x.share === 'number') : undefined
}));

export const drawStore = jsonStore<Draw>('draws', 'launchpage.draws.v1', (d) => ({
  project: s(d.project),
  date: s(d.date),
  description: s(d.description),
  amount: n(d.amount) ?? 0,
  notes: s(d.notes),
  bankLineId: s(d.bankLineId) || null
}));

// ---------- Reading a statement ----------

/** CSV rows, with quoted fields ("a, b") and CRLF handled. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const money = (v: string | undefined) => {
  const t = (v ?? '').replace(/[$,\s]/g, '');
  return t === '' || isNaN(Number(t)) ? null : Number(t);
};
/** 10/31/2026 → 2026-10-31 */
const isoOf = (v: string) => {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

export interface ParsedLine {
  account: string;
  date: string;
  kind: string;
  text: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  fp: string;
  key: string;
}

const ATB = ['transaction date', 'account rtn', 'account number', 'transaction type', 'customer reference number', 'debit amount', 'credit amount', 'principal balance amount', 'extended text', 'bank reference number'];

/** An ATB statement export (with or without its header row). Unrecognised files → error. */
export function parseStatement(text: string): { lines: ParsedLine[]; error?: string } {
  const rows = csvRows(text.replace(/^﻿/, ''));
  if (!rows.length) return { lines: [], error: 'The file is empty.' };
  let col = ATB.map((_, i) => i);
  let body = rows;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  if (head.includes('transaction date')) {
    col = ATB.map((h) => head.indexOf(h));
    body = rows.slice(1);
    if (col[0] < 0 || col[2] < 0 || col[8] < 0) return { lines: [], error: 'This doesn’t look like an ATB statement export (no Account Number / Extended Text columns).' };
  } else if (!isoOf(rows[0][0] ?? '')) return { lines: [], error: 'This doesn’t look like an ATB statement export: the first column should be a date (MM/DD/YYYY).' };
  const seen = new Map<string, number>();
  const lines: ParsedLine[] = [];
  for (const r of body) {
    const date = isoOf(r[col[0]] ?? '');
    if (!date) continue;
    const account = (r[col[2]] ?? '').trim();
    const debit = money(r[col[5]]);
    const credit = money(r[col[6]]);
    // A card's notice lines come as $0.00 charges ("AN OVERLIMIT FEE WAS ASSESSED…"): not transactions.
    if (!debit && !credit) continue;
    const balance = money(r[col[7]]);
    const t = (r[col[8]] ?? '').replace(/\s+$/, '');
    const base = [account, date, debit ?? '', credit ?? '', balance ?? '', t.replace(/\s+/g, ' ')].join('|');
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    lines.push({ account, date, kind: (r[col[3]] ?? '').trim(), text: t.replace(/\s{2,}/g, '  '), debit, credit, balance, fp: `${base}|${nth}`, key: merchantKey(t) });
  }
  return lines.length ? { lines } : { lines: [], error: 'No transactions found in the file.' };
}

const PREFIXES = [
  /^VISA POS Purchase\s+/i,
  /^POS Purchase\s+/i,
  /^POS Return\s+/i,
  /^Direct Debit Misc\. Payments\s+/i,
  /^Direct Debit\s+/i,
  /^Direct Deposit Bill Payment\s+/i,
  /^Direct Deposit\s+/i
];

/**
 * The merchant, cleaned for matching: store numbers, city and the repeated name dropped.
 * POS Purchase WALMART STORE #3640 WALMART STORE #36 → WALMART STORE
 * PORKBUN.COM              SHERWOOD     OR → PORKBUN COM
 * MICROSOFT#G193821209 MICROSOFT#G → MICROSOFT
 * WIX.COM, WIX COM/1266632553 → WIX COM
 */
export function merchantKey(raw: string): string {
  let t = raw.trim();
  for (const p of PREFIXES) t = t.replace(p, '');
  // Card lines pad the city with spaces; POS lines pad what's left over.
  t = t.split(/\s{2,}/)[0];
  // POS lines repeat the name, cut short: keep the first copy.
  const words = t.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ');
    const right = words.slice(i).join(' ');
    if (right.length >= 3 && left.toUpperCase().startsWith(right.toUpperCase())) {
      t = left;
      break;
    }
  }
  return t
    .toUpperCase()
    .replace(/#\S*/g, ' ')
    .replace(/\/?\d{4,}\S*/g, ' ')
    .replace(/[.*/]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w) && w !== '-')
    .join(' ')
    .trim();
}

/** WALMART STORE → Walmart Store (the description until a rule names it). */
export const tidy = (key: string) => key.toLowerCase().replace(/(^|[\s\-/.(])([a-z])/g, (_, a, b) => a + b.toUpperCase());

const squash = (t: string) => t.toLowerCase().replace(/0/g, 'o').replace(/[^a-z0-9]/g, '');
const STOP = new Set(['the', 'and', 'inc', 'ltd', 'store', 'fuel', 'cash']);
/** Entries that name the kind of spend first and the merchant second ("Fuel - Esso"). */
const GENERIC = new Set(['fuel', 'hotel', 'etransfer', 'cashrequired']);
/** The merchant in "Merchant - purpose" as words to look for: "Players Lounge - Crew Dinner" → players, lounge; "Fuel - Esso" → esso. */
function merchantWords(description: string): string[] {
  const parts = description.split(/\s+-\s*|\s*-\s+|\s+->\s+/).map((x) => x.trim()).filter(Boolean);
  const name = GENERIC.has(squash(parts[0] ?? '')) ? parts[1] ?? '' : parts[0] ?? '';
  return name.split(/[\s\-/]+/).map(squash).filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * The Common Expenses that fit a bank merchant, best first: entries confirmed for this merchant
 * before (most recently used first), then entries whose merchant name is in the bank text. When
 * nothing's been confirmed yet, the account decides: a personal account prefers the owner's
 * (personal) entries, a business account or card the business ones.
 */
export function commonFor(list: CommonExpense[], key: string, personalAccount: boolean, amount?: number): CommonExpense[] {
  if (!key) return [];
  const bank = squash(key);
  const known = list.filter((c) => c.keys.includes(key)).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  const named = list.filter((c) => !c.keys.includes(key) && ((ws) => ws.length > 0 && ws.every((w) => bank.includes(w)))(merchantWords(c.description)));
  named.sort((a, b) => Number(personalAccount ? b.route === 'personal' : b.route !== 'personal') - Number(personalAccount ? a.route === 'personal' : a.route !== 'personal') || b.lastDate.localeCompare(a.lastDate) || a.sort - b.sort);
  const all = [...known, ...named];
  // A FIXED bill at the same amount (within $0.50 or 3%, for exchange rates) is the one: PayPal $12.99 → Soundcloud.
  if (amount === undefined) return all;
  const same = all.filter((c) => c.type === 'FIXED' && c.amount !== null && Math.abs(Math.abs(amount) - c.amount) <= Math.max(0.5, c.amount * 0.03));
  same.sort((a, b) => Math.abs(Math.abs(amount) - (a.amount ?? 0)) - Math.abs(Math.abs(amount) - (b.amount ?? 0)));
  return [...same, ...all.filter((c) => !same.includes(c))];
}

/** Spending carries GST unless the entry says otherwise; insurance, fees and dues, and other aren't taxed. */
export const spends = (route: Route) => route === 'expense' || route === 'personal';
export const hasGst = (c: { gst: boolean | null; pmtCategory: string; route: Route }) =>
  spends(c.route) && (c.gst ?? !/INSURANCE|FEES|DUES|OTHER|TAX/i.test(c.pmtCategory));

// ---------- Where each line goes ----------

/** GST collected inside a deposit (an invoice is billed + 5% GST, so the GST is deposit × 5/105). */
export const gstCollected = (deposit: number) => Math.round(((deposit * 5) / 105) * 100) / 100;

/** GST: 5% of the total, as the Launch Sheet works it out (Nov 1, Dan: $96.59 → $4.83). */
export const GST_RATE = 0.05;
export const gstIn = (total: number) => Math.round(total * GST_RATE * 100) / 100;

export type Status = 'duplicate' | 'common' | 'matched' | 'auto' | 'check' | 'edited' | 'saved';
export const STATUS_LABEL: Record<Status, string> = {
  duplicate: 'Already imported',
  common: 'Common expense',
  matched: 'Matched',
  auto: 'Auto',
  check: 'Check',
  edited: 'Edited',
  saved: 'Saved'
};

export interface Draft extends ParsedLine {
  id: string;
  route: Route;
  status: Status;
  /** Why it was routed this way (shown on hover). */
  why: string;
  project: string;
  description: string;
  method: string;
  type: string;
  category: string;
  pmtCategory: string;
  /** Expense: debit, or a refund as a negative. Draw / income: the amount moved. */
  amount: number;
  gst: number;
  /** An expense already in Records (paid from Budget) this line is: linked, not added again. */
  expenseId: string | null;
  invoiceId: string | null;
  /** The Common Expenses entry it was filled from (or confirmed as). */
  commonId: string | null;
  /** The other side of a draw (the personal account's e-transfer received). */
  pairOf: string | null;
  /** Your note: goes on the expense / draw. */
  notes: string;
  /** A saved line reopened (Nov 1): its parts as saved. */
  savedParts?: Part[];
  /** Budget audit (Nov 1): the Budget line this bill is, when the bank charged a different amount; apply updates it. */
  budget?: { lineId: string; planned: number; description: string; apply: boolean };
}

const owed = (l: ParsedLine) => l.debit ?? -(l.credit ?? 0);
const daysApart = (a: string, b: string) => Math.abs(new Date(a + 'T12:00').getTime() - new Date(b + 'T12:00').getTime()) / 86_400_000;
const CARD_PAYMENT = /Bill Payment ATB Mastercard|PAYMENT - THANK YOU|PAYMENT RECEIVED/i;

/**
 * First pass at every line: Common Expenses where the merchant has been documented before,
 * otherwise ATB's own clues (card payments, e-transfers, deposits, interest, fees) and the account
 * it's from. Lines already imported are marked so they're skipped.
 */
export function draft(
  parsed: ParsedLine[],
  ctx: { accounts: BankAccount[]; common: CommonExpense[]; imported: BankLine[]; expenses: Expense[]; invoices: Invoice[]; owner: string; business: string; personal: string; budget?: BudgetLine[] }
): Draft[] {
  const done = new Set(ctx.imported.map((l) => l.fp));
  const acct = (num: string) => ctx.accounts.find((a) => a.number === num);
  const usedExpense = new Set(ctx.imported.map((l) => l.expenseId).filter(Boolean));
  const ownerRe = ctx.owner.trim() ? new RegExp(ctx.owner.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  const out: Draft[] = parsed
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account))
    .map((l) => {
      const a = acct(l.account);
      const kind = a?.kind ?? 'personal';
      const amt = owed(l);
      const base: Draft = {
        ...l,
        id: crypto.randomUUID(),
        route: 'personal',
        status: 'check',
        why: '',
        project: '',
        description: tidy(l.key) || l.text,
        method: a?.method ?? '',
        type: '',
        category: '',
        pmtCategory: '',
        amount: amt,
        gst: 0,
        expenseId: null,
        invoiceId: null,
        commonId: null,
        pairOf: null,
        notes: ''
      };
      const set = (p: Partial<Draft>) => Object.assign(base, p);
      if (done.has(l.fp)) return set({ status: 'duplicate', why: 'Imported before: skipped.', route: ctx.imported.find((x) => x.fp === l.fp)?.route ?? 'personal' });

      if (CARD_PAYMENT.test(l.text)) return set({ route: 'transfer', status: 'auto', why: 'Card payment between your own accounts.', description: 'ATB Mastercard payment', amount: Math.abs(amt) });
      // Nov 1 (FY2026 back books): moves between your own accounts; a transfer from the business to
      // the owner's chequing is a draw.
      if (/^Transfer (to|from) /i.test(l.text)) {
        const toOwner = kind === 'business' && !!ownerRe?.test(l.text) && (l.debit ?? 0) > 0;
        return toOwner
          ? set({ route: 'draw', status: 'auto', why: 'A transfer from the business to your chequing: a draw.', description: `Transfer - ${ctx.owner}`, project: ctx.business, amount: Math.abs(amt) })
          : set({ route: 'transfer', status: 'auto', why: 'A transfer between your own accounts.', description: l.text.replace(/\s+/g, ' ').trim(), amount: Math.abs(amt) });
      }
      if (kind === 'business' && (l.debit ?? 0) > 0 && /Withdrawal (Interac )?ABM|Withdrawal Intl ABM|VISA Withdrawal/i.test(l.text))
        return set({ route: 'draw', status: 'check', why: 'Cash taken out of the business account: a draw? Change it if it paid a business cost.', description: 'Cash withdrawal', project: ctx.business, amount: Math.abs(amt) });
      if (/PAD CCRA|CANADA REVENUE|CRA\b/i.test(l.text))
        return set({ route: 'expense', status: 'check', why: 'A payment to the CRA (corporate tax, GST or payroll remittance): check which, it may not be an expense.', description: 'CRA - Tax payment', project: ctx.business, type: 'VARIABLE', category: 'MWD', pmtCategory: 'REG/ TAXES', amount: Math.abs(amt), gst: 0 });
      if (kind === 'business' && (l.credit ?? 0) > 0 && /e-Transfer (Received|Auto-claimed)/i.test(l.text))
        return set({ route: 'income', status: 'check', why: 'Money received into the business account: a client payment, a refund or a loan back?', description: `Payment - ${l.text.replace(/^.*e-Transfer (Received|Auto-claimed)-?\s*/i, '').trim() || 'e-transfer'}`, project: ctx.business, amount: l.credit ?? 0, gst: 0 });
      if (/^Interest/i.test(l.kind) || /^Interest Payment/i.test(l.text)) return set({ route: 'interest', status: 'auto', why: 'Interest paid on the account.', description: 'Interest', amount: Math.abs(amt) });
      if (/e-Transfer Sent/i.test(l.text) && kind === 'business') {
        const to = l.text.replace(/^.*e-Transfer Sent(-Autodep)?\s*-\s*/i, '').trim();
        const mine = !!ownerRe?.test(to);
        return set({
          route: 'draw',
          status: mine ? 'auto' : 'check',
          why: mine ? `E-transfer to ${to} from the business account.` : `E-transfer to ${to || 'someone'} from the business account: a draw? Change it if it's a payment.`,
          description: `E-Transfer - ${to}`,
          project: ctx.business,
          amount: Math.abs(amt)
        });
      }

      const rule = commonFor(ctx.common, l.key, kind === 'personal', amt)[0];
      if (rule) {
        set({
          route: rule.route,
          status: 'common',
          commonId: rule.id,
          why: `Common Expenses: ${rule.description}${rule.lastDate ? ` (last used ${rule.lastDate})` : ''}.`,
          project: rule.project,
          description: rule.description,
          type: rule.type,
          category: rule.category,
          pmtCategory: rule.pmtCategory,
          gst: hasGst(rule) ? gstIn(Math.abs(amt)) * Math.sign(amt) : 0
        });
        // A FIXED bill at a different amount than usual (PayPal $1,453 isn't the $12.99 subscription;
        // last year's insurance was a different charge): filled in, but to check.
        if (rule.type === 'FIXED' && rule.amount !== null && Math.abs(Math.abs(amt) - rule.amount) > Math.max(0.5, rule.amount * 0.03))
          set({ status: 'check', why: `${rule.description} is usually ${cad(rule.amount)}; this is ${cad(Math.abs(amt))}. Check it's the same thing.` });
      } else if (/Direct Deposit/i.test(l.text) && (l.credit ?? 0) > 0 && kind === 'business') {
        set({ route: 'income', status: 'check', why: 'A deposit into the business account: a client payment? It goes to Records → Income; link it to its invoice there if it isn\'t matched here.', description: `Payment - ${tidy(l.key)}`, amount: l.credit ?? 0, gst: gstCollected(l.credit ?? 0), project: ctx.business });
      } else if (/e-Transfer Received/i.test(l.text)) {
        set({ route: 'personal', status: 'check', why: 'E-transfer received: personal unless it’s the other side of a draw.', description: 'E-Transfer Received', amount: l.credit ?? 0 });
      } else {
        // Nov 1: a merchant with no Common Expense starts as personal (the personal division) on any
        // account, card and business included, until it's documented.
        set({ route: 'personal', status: 'check', why: `New merchant on the ${a?.name || 'account'}: personal (${ctx.personal}) until you document it.`, project: ctx.personal });
      }

      // Every spending line shows its GST (5% of the total) unless its Common Expense says none.
      // Not on money moving between people, cash, bank fees or money received (other than a refund).
      const noGst = /e-Transfer|ABM|Cash|Interest/i.test(l.text) || /^Fee$/i.test(l.kind) || ((l.credit ?? 0) > 0 && !/Return|Refund|Credit/i.test(`${l.text} ${l.kind}`));
      if (spends(base.route) && !rule && base.status !== 'duplicate' && !noGst) base.gst = gstIn(Math.abs(amt)) * Math.sign(amt);
      // A Budget bill already paid (ticked in Tasks) is this line: link it instead of adding it twice.
      // Same amount within 4 days, or (Nov 1) a bill from Budget by the same name within 6 days at a
      // new amount: the expense takes what the bank charged.
      const bankName = squash(l.key);
      const named = (desc: string) => ((ws) => ws.length > 0 && ws.every((w) => bankName.includes(w)))(merchantWords(desc));
      if (spends(base.route) && amt > 0) {
        const free = ctx.expenses.filter((e) => !usedExpense.has(e.id) && e.amount !== null);
        const hit =
          free.find((e) => Math.abs((e.amount ?? 0) - amt) < 0.005 && daysApart(e.date, l.date) <= 4) ??
          free.find((e) => e.budgetLineId && daysApart(e.date, l.date) <= 6 && (named(e.description) || (!!rule && e.description.trim().toLowerCase() === rule.description.trim().toLowerCase())));
        if (hit) {
          usedExpense.add(hit.id);
          const moved = Math.abs((hit.amount ?? 0) - amt) >= 0.005;
          set({
            route: 'expense',
            expenseId: hit.id,
            status: 'matched',
            why: `Already in Expenses (paid from ${hit.budgetLineId ? 'Budget / Tasks' : 'Records'}): ${hit.description} (${hit.date}). Linked, not added again.${moved ? ` Expenses had ${cad(hit.amount ?? 0)}; it takes the bank's ${cad(amt)}.` : ''}`,
            project: hit.project || base.project,
            description: hit.description || base.description,
            type: hit.type || base.type,
            category: hit.category || base.category,
            pmtCategory: hit.pmtCategory || base.pmtCategory,
            gst: moved ? (hit.gst ? gstIn(amt) : base.gst) : hit.gst ?? base.gst
          });
        }
        // Budget audit: the Budget bill this is (by the expense that paid it, or by name), when the bank
        // charged something else. Fixed and annual bills only (an allotment like groceries isn't one
        // charge); lines priced in another currency are left to Recalc.
        const lineId = hit?.budgetLineId ?? null;
        const bill = (b: BudgetLine) => b.type.toUpperCase() === 'FIXED' || b.section === 'fixed' || b.section === 'annual';
        const candidates = (ctx.budget ?? []).filter((b) => b.amount !== null && !b.currency && bill(b) && (b.id === lineId || (!lineId && (named(b.description) || (!!rule && b.description.trim().toLowerCase() === rule.description.trim().toLowerCase())))));
        const line = candidates.sort((a, b) => Math.abs((a.amount ?? 0) - amt) - Math.abs((b.amount ?? 0) - amt))[0];
        if (line && Math.abs((line.amount ?? 0) - amt) >= 0.005) base.budget = { lineId: line.id, planned: line.amount ?? 0, description: line.description, apply: true };
      }
      if (base.route === 'income') {
        const inv = ctx.invoices.find((i) => !i.datePaid && Math.abs(invoiceTotals(i).subTotal - base.amount) < 0.01);
        if (inv) set({ invoiceId: inv.id, status: 'matched', why: `Pays invoice ${inv.number}: it's marked paid on ${l.date}.`, gst: invoiceTotals(inv).gst });
      }
      return base;
    });

  // The personal side of a draw: an e-transfer received within 3 days of one sent from the business.
  for (const d of out.filter((x) => x.route === 'draw' && x.status !== 'duplicate')) {
    const other = out.find((x) => x.pairOf === null && x !== d && x.status !== 'duplicate' && /e-Transfer Received/i.test(x.text) && Math.abs((x.credit ?? 0) - d.amount) < 0.005 && daysApart(x.date, d.date) <= 3);
    if (other) {
      Object.assign(other, { route: 'transfer', status: 'matched', pairOf: d.id, why: `The other side of the draw on ${d.date} (${d.description}).`, description: `Draw received (${d.date})` });
      d.why += ' Its other side is on your personal account.';
    }
  }
  // No division yet: the owner's personal division (DANMONK26) until it's given one.
  for (const d of out) if (!d.project.trim()) d.project = ctx.personal;
  return out;
}

/**
 * Common Expenses after a line is confirmed: its entry (picked, or typed new) saved as the latest
 * version and taught this bank merchant. Transfers, interest and draws aren't documented here.
 */
export function learn(d: Draft, list: CommonExpense[], parts: Part[] = [], total = d.amount): CommonExpense | null {
  if (d.route !== 'expense' && d.route !== 'personal') return null;
  const same = list.find((c) => c.id === d.commonId && c.description === d.description) ?? list.find((c) => c.description.trim().toLowerCase() === d.description.trim().toLowerCase());
  const keys = same ? [...new Set([...same.keys.filter((k) => k !== d.key), d.key])] : [d.key];
  return {
    id: same?.id ?? crypto.randomUUID(),
    project: d.project,
    description: d.description,
    type: d.type,
    category: d.category,
    pmtCategory: d.pmtCategory,
    route: d.route,
    gst: spends(d.route) ? Math.abs(d.gst) > 0 : null,
    frequency: same?.frequency ?? '',
    keys,
    lastDate: same && same.lastDate > d.date ? same.lastDate : d.date,
    amount: same && same.lastDate > d.date ? same.amount : Math.round(Math.abs(total) * 100) / 100,
    // A split is remembered for a FIXED bill (vehicle insurance every month), as shares of the
    // total; a one-off split (part of a Marks run was personal) isn't. No parts this time clears it.
    split: parts.length && total && d.type === 'FIXED' ? parts.map(({ id: _id, amount, ...rest }) => ({ ...rest, share: amount / total })) : undefined,
    sort: same?.sort ?? list.length
  };
}

// ---------- Fiscal year (Records setup) ----------

/** The fiscal year a date falls in, named by the year it ends: FY2027 = Oct 1 2026 – Sep 30 2027 (fyEnd '09-30'). */
export function fyOf(dateIso: string, fyEnd = '09-30'): number {
  const y = Number(dateIso.slice(0, 4));
  return dateIso.slice(5, 10) > fyEnd ? y + 1 : y;
}
/** FY2027 → { from: '2026-10-01', to: '2027-09-30' } */
export function fyRange(fy: number, fyEnd = '09-30') {
  const to = `${fy}-${fyEnd}`;
  const d = new Date(`${fy - 1}-${fyEnd}T12:00`);
  d.setDate(d.getDate() + 1);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from, to };
}
