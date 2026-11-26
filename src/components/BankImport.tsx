import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FormActions, HeadIcon, SAVE_ICON, Sheet } from './Sheet';
import { BUDGET_CATEGORIES, PMT_CATEGORIES, money, type BudgetLine } from '../lib/budget';
import {
  ROUTES,
  STATUS_LABEL,
  commonFor,
  draft,
  fyOf,
  gstIn,
  hasGst,
  spends,
  learn,
  parseStatement,
  routeByDivision,
  tidy,
  type AccountKind,
  type BankAccount,
  type BankLine,
  type CommonExpense,
  type Draft,
  CARD_PAYMENT,
  type Draw,
  type ParsedLine,
  type Part,
  type Route,
  type Status
} from '../lib/bank';
import { newExpense, type Expense } from '../lib/expenses';
import type { Invoice, InvoiceProfile } from '../lib/invoices';
import { MonthNav, dayLabel } from './Expenses';
import { TitleCombo } from './Rockets';
import { useBooksTools } from '../lib/beta';

export interface ImportResult {
  accounts: BankAccount[];
  lines: BankLine[];
  expenses: Expense[];
  draws: Draw[];
  common: CommonExpense[];
  invoices: Invoice[];
  profile: InvoiceProfile | null;
  /** Reopening saved lines: expenses / draws a changed line no longer makes. */
  removeExpenses?: string[];
  removeDraws?: string[];
  /** V20-485: spreadsheet lines a bank line took over (same charge), removed so nothing counts twice. */
  removeLines?: string[];
  /** True when this saves changes to lines imported before. */
  update?: boolean;
  /** Budget audit: Budget lines updated to what the bank charged. */
  budgetLines?: BudgetLine[];
}

type Props = {
  open: boolean;
  /** V20-493 (Books): opened from an expense's method: show the saved line it came from, on its own. */
  focus?: { month: string; fp: string } | null;
  onClose: () => void;
  /** V20-470 (Dan, Nov 23, Books): after Process, go here (the Books home) instead of back to the page it opened on. */
  onDone?: () => void;
  accounts: BankAccount[];
  common: CommonExpense[];
  imported: BankLine[];
  expenses: Expense[];
  draws: Draw[];
  invoices: Invoice[];
  profile: InvoiceProfile | null;
  /** Budget lines, for the budget audit. */
  budget: BudgetLine[];
  onSave: (r: ImportResult) => Promise<void>;
  /** V20-474 (Dan, Nov 23, Books): "Set up your books": this same table, blank. You type each line (date, account,
   *  amount) and fill it like an imported one; descriptions are learned. A bank .CSV is still one tap away. */
  setup?: boolean;
  cashBook?: { start: string; opening: number };
  onSetOpening?: (start: string, opening: number) => void;
  /** V20-507 (Books setup, track 3): the blank Launch Sheet to fill in, and importing it back. */
  onDownloadSheet?: () => void;
  onImportSheet?: (f: File) => void;
};

/**
 * V20-507 (Dan, Nov 24): the opening balance from a statement's Balance column. Most bank CSVs have no opening row,
 * but a running balance works it out: opening = the balance after the earliest line + what it took out − what it
 * brought in. Every row is checked (each balance = the one before + in − out), which also settles which way the file
 * runs and, for a credit card, that its balance is what you owe (out adds to it).
 */
export type OpeningCheck = { date: string; opening: number; rows: number; ok: number; breakAt: string | null; owed: boolean } | null;
export function workOpening(lines: ParsedLine[]): OpeningCheck {
  const rows = lines.filter((l) => l.balance !== null && !Number.isNaN(l.balance));
  if (!rows.length) return null;
  const net = (l: ParsedLine) => (l.credit ?? 0) - (l.debit ?? 0);
  let best: { list: ParsedLine[]; owed: boolean; ok: number; breakAt: string | null } | null = null;
  for (const list of [rows, [...rows].reverse()])
    for (const owed of [false, true]) {
      let ok = 0;
      let breakAt: string | null = null;
      for (let i = 1; i < list.length; i++) {
        const want = (list[i - 1].balance ?? 0) + (owed ? -net(list[i]) : net(list[i]));
        if (Math.abs(want - (list[i].balance ?? 0)) < 0.005) ok++;
        else if (!breakAt) breakAt = list[i].date;
      }
      if (!best || ok > best.ok || (ok === best.ok && list[0].date < best.list[0].date)) best = { list, owed, ok, breakAt };
    }
  if (!best) return null;
  const first = best.list[0];
  const opening = Math.round(((first.balance ?? 0) - (best.owed ? -net(first) : net(first))) * 100) / 100;
  return { date: first.date, opening, rows: best.list.length, ok: best.ok + 1, breakAt: best.breakAt, owed: best.owed };
}

const KINDS: { id: AccountKind; label: string; method: string }[] = [
  { id: 'business', label: 'Business', method: 'ATB B.' },
  { id: 'personal', label: 'Personal', method: 'ATB P.' },
  { id: 'card', label: 'Credit card', method: 'ATB MC' },
  { id: 'savings', label: 'Savings', method: 'ATB S.' }
];
const TYPES = ['FIXED', 'VARIABLE'];
const last4 = (n: string) => `••${n.replace(/\D/g, '').slice(-4)}`;

/** A new account from a statement: its kind and name guessed from the file name and number. */
function guessAccount(number: string, file: string, sort: number): BankAccount {
  const f = file.toUpperCase();
  const kind: AccountKind = number.includes('*') || /MASTERCARD|VISA|CARD/.test(f) ? 'card' : /BUSINESS|LTD|CORP|INC\b/.test(f) ? 'business' : /SAVING|TAX/.test(f) ? 'savings' : 'personal';
  const named = f.match(/(PERSONAL|MASTERCARD|BUSINESS|INCOME_TAX_PAYABLE|SAVINGS)/)?.[1]?.replace(/_/g, ' ');
  const name = `ATB ${named ? named.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : KINDS.find((k) => k.id === kind)!.label} ${last4(number)}`;
  return { id: crypto.randomUUID(), number, name, method: KINDS.find((k) => k.id === kind)!.method, kind, sort };
}


/**
 * Type or pick (Nov 1): type anything, or ▾ for every value already in use (the merchant's own
 * Common Expenses first for Description); typing filters the list.
 */
function Pick(p: { value: string; options: string[]; groups?: { label: string; options: string[] }[]; onChange: (v: string) => void; label: string; disabled?: boolean; wide?: boolean; /** V20-472: Books outlines an empty box that still needs filling. */ need?: boolean; accent?: string }) {
  const books = useBooksTools(); // V20-532: the Books import runs in Main too.
  const titles = [...new Set([...(p.groups ?? []).flatMap((g) => g.options), ...p.options])];
  if (p.disabled)
    return (
      <span className={`bank-cell-off${p.wide ? ' is-wide' : ''}`} title={p.value}>
        {p.value || '—'}
      </span>
    );
  return (
    <div className={`bank-combo${p.wide ? ' is-wide' : ''}${books && p.need && !p.value.trim() ? ' is-need' : ''}`}>
      <TitleCombo value={p.value} titles={titles} onChange={p.onChange} placeholder="—" required={false} label={p.label} steady={books} accent={p.accent} />
    </div>
  );
}

/** Work in progress (Nov 1): kept on this device until it's saved or cleared, so closing the sheet loses nothing. */
const DRAFT_KEY = 'launchpage.bank-draft.v1';
/** V20-513 (Dan, Nov 24, Books): Split lives in the Division list (the ↳ button is gone on Books). */
const SPLIT = 'SPLIT';
/** V20-509: one draft per signed-in account (STARDVST's work never shows, or gets wiped, in FNTSY LVNG's import). */
const DOWNLOAD_ICON = 'M12 4v11M7 10l5 5 5-5M5 20h14';
const UPLOAD_ICON = 'M12 15V4M7 9l5-5 5 5M5 20h14';

function draftKey() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!/^sb-.+-auth-token$/.test(k)) continue;
      const id = (JSON.parse(localStorage.getItem(k) ?? 'null') as { user?: { id?: string } } | null)?.user?.id;
      if (id) return `${DRAFT_KEY}.${id}`;
    }
  } catch {
    /* ignore */
  }
  return DRAFT_KEY;
}
type Saved = { parsed: ParsedLine[]; files: string[]; edits: Record<string, Partial<Draft>>; skip: string[]; accounts: BankAccount[]; parts?: Record<string, Part[]>; defDiv?: string | null };
function loadDraft(): Saved | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey()) ?? 'null') as Saved | null;
    return d && Array.isArray(d.parsed) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Import CSV (V20-015): bank statements → Records. Every line is shown before anything is saved,
 * with where it's going (Expense, Draw, Income, Transfer, Personal, Interest) and how it's filled in
 * (from Common Expenses, matched to a bill already paid or an invoice, or to check). Save sends
 * expenses to Expenses, draws to Draws, marks paid invoices, and teaches Common Expenses.
 */
export function BankImport(p: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const saved = useMemo(loadDraft, []);
  // V20-526: the default division for this import's business lines (see lineDiv).
  const [defDiv, setDefDiv] = useState<string | null>(() => saved?.defDiv ?? null);
  const [parsed, setParsed] = useState<ParsedLine[]>(saved?.parsed ?? []);
  const [files, setFiles] = useState<string[]>(saved?.files ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>(() => [...p.accounts, ...(saved?.accounts ?? []).filter((a) => !p.accounts.some((x) => x.id === a.id || x.number === a.number) && (saved?.parsed ?? []).some((l) => l.account === a.number))]);
  const [fyEnd, setFyEnd] = useState(p.profile?.fyEnd ?? '09-30');
  const [personal, setPersonal] = useState(p.profile?.personalDivision || (p.profile?.person ?? '').toUpperCase().replace(/\s+/g, '') || 'PERSONAL');
  // Opening the sheet starts from what's saved (the profile and accounts load after the page).
  // V20-508: the divisions you've added (your business is always one).
  const [divs, setDivs] = useState<string[]>(p.profile?.divisions ?? []);
  const [newDiv, setNewDiv] = useState('');
  const defaultPersonal = p.profile?.personalDivision || (p.profile?.person ?? '').toUpperCase().replace(/\s+/g, '') || 'PERSONAL';
  useEffect(() => {
    if (!p.open) return;
    setFyEnd(p.profile?.fyEnd ?? '09-30');
    setPersonal(defaultPersonal);
    setDivs(p.profile?.divisions ?? []);
    // V20-491: the saved accounts always win; work kept in this browser only adds accounts that aren't saved yet and
    // that its lines still use (an old copy could otherwise bring back merged accounts or an old kind on Process).
    setAccounts((cur) => [...p.accounts, ...cur.filter((a) => !p.accounts.some((x) => x.id === a.id || x.number === a.number) && parsed.some((l) => l.account === a.number))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.profile?.id, p.profile?.fyEnd, defaultPersonal, p.accounts]);
  /** Edits made in the table, by line (fingerprint), kept when the accounts change. */
  const [edits, setEdits] = useState<Record<string, Partial<Draft>>>(saved?.edits ?? {});
  const [skip, setSkip] = useState<Set<string>>(new Set(saved?.skip ?? []));
  /** Lines filled in by following another line of the same new merchant (they keep following until edited). */
  const followers = useRef(new Set<string>());
  /** Split charges (Nov 1): the parts under a line, by line. */
  const [parts, setParts] = useState<Record<string, Part[]>>(saved?.parts ?? {});
  function writeDraft() {
    try {
      // V20-509: only work in progress is written; an empty screen never wipes it (Clear and Process do that).
      if (parsed.length || Object.keys(edits).length || Object.keys(parts).length) localStorage.setItem(draftKey(), JSON.stringify({ parsed, files, edits, skip: [...skip], accounts, parts, defDiv } satisfies Saved));
      return true;
    } catch {
      /* full or blocked: the draft stays in memory */
      return false;
    }
  }
  useEffect(() => {
    writeDraft();
  }, [parsed, files, edits, skip, accounts, parts, defDiv]);
  // V20-531 (Dan): a Save icon in the header. Work saves itself as you go; pressing it saves right now and says so.
  const [savedFlash, setSavedFlash] = useState(false);
  function saveNow() {
    if (!writeDraft()) return;
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
  }
  // V20-525 (Dan, Nov 24): a copy of the work in progress as a file, to keep before Process and load back if needed.
  const copyInput = useRef<HTMLInputElement>(null);
  function saveCopy() {
    const data: Saved = { parsed, files, edits, skip: [...skip], accounts, parts, defDiv };
    const blob = new Blob([JSON.stringify({ kind: 'lp-books-import', savedAt: new Date().toISOString(), ...data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LP-RECORDS-import-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function loadCopy(f: File) {
    try {
      const d = JSON.parse(await f.text()) as Partial<Saved> & { kind?: string };
      if (d.kind !== 'lp-books-import' || !Array.isArray(d.parsed)) throw new Error('not a copy');
      if (parsed.length && !window.confirm('Replace the lines here with the copy?')) return;
      setParsed(d.parsed);
      setFiles(d.files ?? []);
      setEdits(d.edits ?? {});
      setSkip(new Set(d.skip ?? []));
      setParts(d.parts ?? {});
      setDefDiv(d.defDiv ?? null);
      if (Array.isArray(d.accounts)) setAccounts(d.accounts);
      setErrors([]);
    } catch {
      setErrors([`${f.name}: this isn't a saved copy of an import.`]);
    }
  }
  function clearDraft() {
    // V20-476: forget the saved work right away. Process now closes this and leaves the page in the same moment, so
    // waiting for the effect left the old draft in storage, and reopening brought back edited lines as new (18 doubles).
    try {
      localStorage.removeItem(draftKey());
    } catch {
      /* ignore */
    }
    setParsed([]);
    setFiles([]);
    setEdits({});
    setSkip(new Set());
    setParts({});
    setDefDiv(null);
    setErrors([]);
    setAccounts(p.accounts);
  }
  // V20-474: setup lines you type. Their fp starts "manual:"; their date, account and amount are edited in place.
  const isManual = (fp: string) => fp.startsWith('manual:');
  // V20-507 (Dan, Nov 24): three ways to set up: from scratch (type lines), import a bank CSV, or from the Launch Sheet.
  type Track = 'scratch' | 'csv' | 'sheet';
  const [track, setTrack] = useState<Track | null>(() => (saved?.parsed.some((l) => !l.fp.startsWith('manual:')) ? 'csv' : saved?.parsed.length ? 'scratch' : null));
  const sheetInput = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString('en-CA');
  function addLine() {
    const account = accounts.find((a) => a.kind === 'business')?.number ?? accounts[0]?.number ?? '';
    setParsed((l) => [...l, { account, date: today, kind: 'Manual', text: '', debit: null, credit: null, balance: null, fp: `manual:${crypto.randomUUID()}`, key: '' }]);
  }
  function addAccount() {
    const n = accounts.length + 1;
    setAccounts((l) => [...l, { id: crypto.randomUUID(), number: `M${String(n).padStart(4, '0')}`, name: n === 1 ? 'Business account' : `Account ${n}`, method: '', kind: 'business', sort: l.length }]);
  }
  const setLine = (fp: string, patch: Partial<ParsedLine>) => setParsed((l) => l.map((x) => (x.fp === fp ? { ...x, ...patch } : x)));
  /** Money in (Income / Interest) is a credit; everything else goes out (a debit). The row shows it as a plus amount. */
  const moneyIn = (route: Route) => route === 'income' || route === 'interest';
  function setManualAmount(r: Draft, v: number | null) {
    setLine(r.fp, moneyIn(r.route) ? { credit: v, debit: null } : { debit: v, credit: null });
    // GST follows the amount: the Common Expense's rule if it has one, else 5% unless you took it off.
    const c = p.common.find((x) => x.id === r.commonId);
    const gst = !spends(r.route) || !v ? 0 : c ? (hasGst(c) ? gstIn(v) : 0) : r.gst || !r.amount ? gstIn(v) : 0;
    edit(r, { amount: v ?? 0, gst });
  }
  const [openMonth, setOpenMonth] = useState(p.cashBook?.start ?? today.slice(0, 7));
  const [openAmt, setOpenAmt] = useState(p.cashBook ? String(p.cashBook.opening) : '');
  const [fRoute, setFRoute] = useState<Route | ''>('');
  const [fStatus, setFStatus] = useState<Status | ''>('');
  const [fAccount, setFAccount] = useState('');
  const [q, setQ] = useState('');
  const [showDup, setShowDup] = useState(false);
  const [saving, setSaving] = useState(false);

  async function read(list: FileList | null) {
    if (!list?.length) return;
    const all: ParsedLine[] = [...parsed];
    const errs: string[] = [];
    const names = [...files];
    const next = [...accounts];
    for (const f of [...list]) {
      const r = parseStatement(await f.text());
      if (r.error) {
        errs.push(`${f.name}: ${r.error}`);
        continue;
      }
      names.push(f.name);
      const have = new Set(all.map((l) => l.fp));
      all.push(...r.lines.filter((l) => !have.has(l.fp)));
      for (const num of new Set(r.lines.map((l) => l.account))) {
        if (next.some((a) => a.number === num)) continue;
        const g = guessAccount(num, f.name, next.length);
        // V20-510 (Dan, Nov 24): setting up your books starts with your business account. A file name rarely says
        // which kind (ATB's doesn't), so with no business account yet, the first bank account is taken as Business.
        const nameSaid = /PERSONAL|SAVING|TAX/i.test(f.name);
        if (p.setup && g.kind === 'personal' && !nameSaid && !next.some((a) => a.kind === 'business')) next.push({ ...g, kind: 'business', name: `ATB Business ${last4(num)}`, method: 'ATB B.' });
        else next.push(g);
      }
    }
    setParsed(all);
    setFiles(names);
    setErrors(errs);
    setAccounts(next);
  }

  const profile = p.profile;
  // V20-467: Books sorts by Budget item too, and keeps a known merchant sorted within 20%.
  const books = useBooksTools(); // V20-532: the Books import runs in Main too.
  const owner = profile?.person ?? '';
  const business = (profile?.business ?? '').replace(/\s+(LIMITED|LTD\.?|INC\.?|CORP\.?)$/i, '');
  /**
   * V20-526 (Dan, Nov 25): the division this import's business lines start under. Click a division pill to make it the
   * default (a statement that's all one brand); your business name otherwise. Kept with the work in progress.
   */
  // V20-526b (Dan): a picked default applies to every spending line the Common Expenses don't already file, on any
  // account: your personal division → Personal, any other → an Expense under it (as when you pick a division by hand).
  const lineDiv = business;
  const fresh = useMemo(
    () => {
      const out = draft(parsed, { accounts, common: p.common, imported: p.imported, expenses: p.expenses, invoices: p.invoices, owner, business: lineDiv, personal, budget: p.budget, books });
      if (!books || !defDiv) return out;
      return out.map((d): Draft =>
        (d.route === 'expense' || d.route === 'personal') && !d.commonId && d.status !== 'duplicate'
          ? { ...d, project: defDiv, route: (defDiv === personal ? 'personal' : 'expense') as Route }
          : d
      );
    },
    [parsed, accounts, p.common, p.imported, p.expenses, p.invoices, owner, lineDiv, personal, p.budget, books, defDiv]
  );

  /**
   * Saved (Nov 1): reopen a month of lines already imported, in the same table. Each line comes back
   * as it was saved (its expense, draw or parts); saving updates them, adds or removes the expense /
   * draw when where it goes changes, and teaches Common Expenses again.
   */
  const [mode, setMode] = useState<'new' | 'saved'>('new');
  const lastMonth = p.imported.reduce((m, l) => (l.date.slice(0, 7) > m ? l.date.slice(0, 7) : m), '') || new Date().toLocaleDateString('en-CA').slice(0, 7);
  const [savedMonth, setSavedMonth] = useState(lastMonth);
  // V20-493: an expense's source: open Saved on its month with only that line showing (Show all lifts it).
  const [onlyFp, setOnlyFp] = useState<string | null>(null);
  useEffect(() => {
    if (!p.open) return;
    if (!p.focus) return setOnlyFp(null);
    setMode('saved');
    setSavedMonth(p.focus.month);
    setOnlyFp(p.focus.fp);
  }, [p.open, p.focus]);
  const savedRows = useMemo<Draft[]>(() => {
    const strip = (notes: string, text: string) => notes.replace(text, '').replace(/\s*\(part of [^)]*\)/, '').replace(/\s*—\s*$/, '').trim();
    return p.imported
      // V20-522 (Dan): setting up, Saved shows every saved line (no month picker).
      .filter((l) => (books && p.setup) || l.date.slice(0, 7) === savedMonth)
      .sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account) || a.sort - b.sort)
      .map((l) => {
        const a = accounts.find((x) => x.number === l.account);
        const owedAmt = l.debit ?? -(l.credit ?? 0);
        const e = l.expenseId ? p.expenses.find((x) => x.id === l.expenseId) : undefined;
        const d = l.drawId ? p.draws.find((x) => x.id === l.drawId) : undefined;
        const rule = commonFor(p.common, l.key, a?.kind === 'personal', l.debit ?? -(l.credit ?? 0))[0];
        const src = e ?? (l.route === 'personal' ? l.filed ?? rule : undefined);
        const parts: Part[] | undefined = l.parts?.map((x) => {
          const pe = x.expenseId ? p.expenses.find((y) => y.id === x.expenseId) : undefined;
          // V20-519: a part reopens as what it was saved as (a Draw part stayed a draw, not Personal).
          const pd = x.drawId ? p.draws.find((y) => y.id === x.drawId) : undefined;
          return { id: x.expenseId ?? crypto.randomUUID(), route: x.route, project: pe?.project ?? pd?.project ?? x.project, description: pe?.description ?? pd?.description ?? x.description, type: pe?.type ?? x.type ?? '', category: pe?.category ?? x.category ?? '', pmtCategory: pe?.pmtCategory ?? x.pmtCategory ?? '', amount: x.amount, gst: pe ? !!pe.gst : !!x.gst };
        });
        return {
          account: l.account, date: l.date, kind: l.kind, text: l.text, debit: l.debit, credit: l.credit, balance: l.balance, fp: l.fp, key: l.key,
          id: l.id,
          route: l.route,
          status: 'saved',
          why: `Saved${e ? ` as ${e.description}` : d ? ` as a draw (${d.description})` : ''}. Change anything and save again.`,
          project: l.income?.project ?? d?.project ?? src?.project ?? l.filed?.project ?? (l.route === 'personal' ? personal : ''),
          // V20-521b: a line saved before its name was kept gets the same name the import gave it (card payments).
          description: l.income?.description ?? d?.description ?? src?.description ?? l.filed?.description ?? l.description ?? (CARD_PAYMENT.test(l.text) ? 'ATB Mastercard payment' : tidy(l.key)),
          method: e?.method ?? a?.method ?? '',
          type: src?.type || l.filed?.type || '',
          category: src?.category || l.filed?.category || '',
          pmtCategory: src?.pmtCategory || l.filed?.pmtCategory || '',
          amount: l.route === 'expense' || l.route === 'personal' ? owedAmt : Math.abs(owedAmt),
          gst: l.income?.gst ?? e?.gst ?? 0,
          expenseId: l.expenseId,
          invoiceId: l.invoiceId,
          commonId: rule?.id ?? null,
          pairOf: null,
          notes: l.income?.notes ?? (e ? strip(e.notes, l.text) : d?.notes ?? l.filed?.notes ?? ''),
          savedParts: parts
        } satisfies Draft;
      });
  }, [p.imported, p.expenses, p.draws, p.common, accounts, savedMonth, personal, books, p.setup]);
  const base = mode === 'saved' ? savedRows : fresh;
  /**
   * Lines with their splits. A line's parts are the ones made here, or (until then) the split its
   * Common Expense remembers, by the same shares. The main line keeps what the parts don't cover;
   * its GST follows its own share.
   */
  const rows = useMemo(
    () =>
      base.map((d) => {
        // V20-476: a line already imported stays "already here", whatever an old edit says.
        const r = d.status === 'duplicate' ? { ...d, ...edits[d.fp], status: d.status, route: d.route } : { ...d, ...edits[d.fp] };
        const total = r.amount;
        let ps: Part[] | undefined = parts[d.fp] ?? d.savedParts;
        if (!ps && r.status !== 'duplicate' && r.status !== 'saved') {
          const split = p.common.find((c) => c.id === r.commonId)?.split;
          ps = split?.map((x, k) => ({ id: `${d.fp}#${k}`, route: x.route, project: x.project, description: x.description, type: x.type, category: x.category, pmtCategory: x.pmtCategory, gst: x.gst, amount: Math.round(total * x.share * 100) / 100 }));
        }
        ps = ps ?? [];
        if (!ps.length) return { ...r, total, parts: ps };
        const rest = Math.round((total - ps.reduce((a, x) => a + x.amount, 0)) * 100) / 100;
        return { ...r, total, parts: ps, amount: rest, gst: r.gst ? gstIn(Math.abs(rest)) * Math.sign(rest) : 0 };
      }),
    [base, edits, parts, p.common]
  );
  type Row = (typeof rows)[number];
  const setPartsOf = (r: Row, next: Part[]) => setParts((m) => ({ ...m, [r.fp]: next }));
  /** ↳ Split: a new part under the line, like a step under a task. It starts as a copy with no amount. */
  const addPart = (r: Row) =>
    // V20-516 (Dan, Nov 24): a part of a draw is a business cost paid out of it (an e-transfer that was $300 garage
    // rent, the rest a draw): it starts as an Expense under the business. Elsewhere: business ↔ personal as before.
    setPartsOf(r, [...r.parts, { id: crypto.randomUUID(), route: r.route === 'personal' || r.route === 'draw' ? 'expense' : 'personal', project: r.route === 'personal' || r.route === 'draw' ? business : personal, description: r.description, type: r.type, category: r.category, pmtCategory: r.pmtCategory, amount: 0, gst: r.route === 'personal' }]);
  const setPart = (r: Row, id: string, patch: Partial<Part>) => setPartsOf(r, r.parts.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  /** A Common Expenses pick on a part fills it like a line. */
  function setPartDescription(r: Row, x: Part, description: string) {
    const c = p.common.find((e) => e.description === description);
    setPart(r, x.id, c ? { description, route: c.route === 'personal' ? 'personal' : 'expense', project: c.project, type: c.type, category: c.category, pmtCategory: c.pmtCategory, gst: hasGst(c) } : { description });
  }
  const partGst = (x: Part) => (spends(x.route) && x.gst ? gstIn(Math.abs(x.amount)) * Math.sign(x.amount) : 0);
  const startedCheck = useMemo(() => new Set(base.filter((d) => d.status === 'check').map((d) => d.fp)), [base]);
  const acct = (n: string) => accounts.find((a) => a.number === n);
  const live = rows.filter((r) => r.status !== 'duplicate' && !skip.has(r.fp));
  const changed = mode === 'saved' ? rows.filter((r) => edits[r.fp] || parts[r.fp]) : [];
  const dups = rows.filter((r) => r.status === 'duplicate').length;
  const needle = q.trim().toLowerCase();
  /**
   * Orange (Nov 1): a line that still needs work: marked Check, or spending not filled in all the way
   * across (division, description, type, group and category), or a split part that isn't.
   */
  const blank = (x: { project: string; description: string; type: string; category: string; pmtCategory: string }) => [x.project, x.description, x.type, x.category, x.pmtCategory].some((v) => !(v ?? '').trim());
  const needsWork = (r: (typeof rows)[number]) => r.status !== 'duplicate' && !skip.has(r.fp) && (r.status === 'check' || (spends(r.route) && blank(r)) || r.parts.some((x) => blank(x)));
  /**
   * V20-497 (Dan, Nov 23, Books): stacks. Sort one merchant at a time: every line from that merchant stacks together
   * (filled with the best guess), you confirm them, and finishing the last one moves to the next merchant still to sort.
   */
  const stackKeys = useMemo(() => {
    const out: string[] = [];
    for (const r of live) if (r.key && needsWork(r) && !out.includes(r.key)) out.push(r.key);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, skip]);
  /**
   * V20-513 (Dan, Nov 24): the merchant list is fixed when you start, and nothing moves on by itself (filling one box
   * used to jump to the next merchant). Accept, Skip or Back move between merchants; past the last, back to all lines.
   */
  const [stackList, setStackList] = useState<string[] | null>(null);
  const [stackIdx, setStackIdx] = useState(0);
  const stackOn = !!stackList;
  const stackKey = stackList?.[stackIdx] ?? null;
  const stopStack = () => (setStackList(null), setStackIdx(0));
  const stackGo = (i: number) => (stackList && i >= stackList.length ? stopStack() : setStackIdx(Math.max(0, i)));
  const stackRows = stackOn && stackKey ? live.filter((r) => r.key === stackKey) : [];
  const confirmLine = (r: Draft) => edit(r, { status: 'edited' });
  const shown = rows.filter(
    (r) =>
      (!stackOn || !stackKey || r.key === stackKey) &&
      (!onlyFp || r.fp === onlyFp) &&
      (showDup || r.status !== 'duplicate') &&
      (!fRoute || r.route === fRoute) &&
      // A line being worked on stays in the Check filter until the filter changes.
      (!fStatus || r.status === fStatus || (fStatus === 'check' && (startedCheck.has(r.fp) || needsWork(r)))) &&
      (!fAccount || r.account === fAccount) &&
      (!needle || [r.text, r.description, r.project, r.category, r.pmtCategory].some((v) => v.toLowerCase().includes(needle)))
  );
  const sum = (route: Route) => live.reduce((a, r) => a + (r.route === route ? r.amount : 0) + r.parts.filter((x) => x.route === route).reduce((b, x) => b + x.amount, 0), 0);
  const expenseGst = live.reduce((a, r) => a + (r.route === 'expense' ? r.gst : 0) + r.parts.reduce((b, x) => b + partGst(x), 0), 0);
  const overSplit = live.filter((r) => r.parts.length && (r.total >= 0 ? r.amount < -0.004 : r.amount > 0.004));
  const fys = [...new Set(live.map((r) => fyOf(r.date, fyEnd)))].sort();

  const pick = (f: (c: CommonExpense) => string) => [...new Set([...p.common.map(f), ...p.expenses.map((e) => f(e as unknown as CommonExpense))].map((x) => (x ?? '').trim()).filter(Boolean))].sort();
  // Values typed in this import join the lists straight away (CC PMT typed once is offered on the next line).
  const typed = (f: (x: { project: string; category: string; pmtCategory: string; description: string }) => string) =>
    rows.flatMap((r) => [f(r), ...r.parts.map(f)]).map((x) => (x ?? '').trim()).filter(Boolean);
  const divisions = [...new Set([...pick((c) => c.project), ...typed((x) => x.project), ...divs, personal, business].filter(Boolean))].sort();
  // The sheet's full lists, in its order, then anything else already in use.
  const groups = [...new Set([...BUDGET_CATEGORIES, ...pick((c) => c.category), ...typed((x) => x.category)])];
  const cats = [...new Set([...PMT_CATEGORIES, ...pick((c) => c.pmtCategory), ...typed((x) => x.pmtCategory)])];
  const descriptions = [...new Set([...p.common.map((c) => c.description), ...typed((x) => x.description)])].sort();

  /**
   * An edit to a line. A new merchant (Check) is documented once: its other lines in this import
   * that haven't been touched follow along (two Anthropic charges, one description). GST follows as
   * "has GST or not", worked out on each line's own amount.
   */
  const edit = (r: Draft, patch: Partial<Draft>) =>
    setEdits((m) => {
      // Touched: no longer orange ("Edited"), unless a Common Expenses pick already set its status.
      const mark = r.status === 'check' && !patch.status ? { status: 'edited' as Status } : {};
      const next = { ...m, [r.fp]: { ...m[r.fp], ...patch, ...mark } };
      // Editing a line yourself makes it your own; it stops following the others.
      followers.current.delete(r.fp);
      // V20-513: sorting by merchant, what you fill in on one line fills down into that merchant's other lines where
      // the same box is still empty (each line can still be changed on its own).
      if (stackOn && r.key && r.key === stackKey) {
        const FILL = ['project', 'description', 'type', 'category', 'pmtCategory'] as const;
        for (const o of rows) {
          if (o.fp === r.fp || o.key !== r.key || o.status === 'duplicate') continue;
          const add: Partial<Draft> = {};
          for (const k of FILL) if (k in patch && !(String(o[k] ?? '')).trim() && String(patch[k] ?? '').trim()) (add as Record<string, unknown>)[k] = patch[k];
          if ('commonId' in patch && !o.description.trim()) add.commonId = patch.commonId;
          if (Object.keys(add).length) next[o.fp] = { ...m[o.fp], ...next[o.fp], ...add };
        }
        return next;
      }
      // V20-497: a two-way merchant's lines are each confirmed on their own (a crew dinner isn't the next drinks for one).
      if (base.find((b) => b.fp === r.fp)?.status !== 'check' || !r.key || r.confirm) return next;
      for (const o of base) {
        if (o.fp === r.fp || o.key !== r.key || o.status !== 'check' || o.confirm || (m[o.fp] && !followers.current.has(o.fp))) continue;
        followers.current.add(o.fp);
        const { gst, ...rest } = patch;
        next[o.fp] = { ...m[o.fp], ...rest, ...mark, ...(gst === undefined ? {} : { gst: gst ? gstIn(Math.abs(o.amount)) * Math.sign(o.amount) : 0 }) };
      }
      return next;
    });
  /** Typing or picking a description: a Common Expenses entry fills in the rest. */
  function setDescription(r: Draft, description: string) {
    const c = p.common.find((x) => x.description === description);
    // A draw, income, transfer or interest line keeps where it goes: only spending takes a Common Expense's route.
    if (!c || !spends(r.route)) return edit(r, { description });
    edit(r, {
      description,
      commonId: c.id,
      // V20-496: on Books the division decides personal vs expense.
      route: books ? routeByDivision(c.route, c.project, personal) : c.route,
      project: c.project,
      type: c.type,
      category: c.category,
      pmtCategory: c.pmtCategory,
      gst: hasGst(c) ? gstIn(Math.abs(r.amount)) * Math.sign(r.amount) : 0,
      status: r.status === 'check' || r.status === 'edited' ? 'common' : r.status
    });
  }
  /**
   * V20-472 (Dan, Nov 23, Books): picking a division moves the line with it. Your personal division → Personal;
   * a business division on a Personal line → Expense, and an empty Type fills as VARIABLE (FIXED comes from a
   * Common Expense: the same price every month).
   */
  function setDivision(r: Draft, project: string) {
    if (!books) return edit(r, { project });
    const sq = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const mine = !!project.trim() && sq(project) === sq(personal);
    if (mine && r.route === 'expense') return edit(r, { project, route: 'personal' });
    if (!mine && project.trim() && r.route === 'personal')
      return edit(r, { project, route: 'expense', ...(r.type.trim() ? {} : { type: 'VARIABLE' }), gst: r.gst || gstIn(Math.abs(r.amount)) * Math.sign(r.amount) });
    edit(r, { project, ...(r.route === 'expense' && !r.type.trim() ? { type: 'VARIABLE' } : {}) });
  }
  function setRoute(r: Draft, route: Route) {
    if (isManual(r.fp) && moneyIn(route) !== moneyIn(r.route)) {
      const v = Math.abs(r.amount) || null;
      setLine(r.fp, moneyIn(route) ? { credit: v, debit: null } : { debit: v, credit: null });
      return edit(r, { route, amount: v ?? 0, gst: spends(route) && v ? gstIn(v) : 0, ...(route === 'personal' ? { project: personal } : {}) });
    }
    edit(r, { route, gst: !spends(route) ? 0 : spends(r.route) ? r.gst : gstIn(Math.abs(r.amount)) * Math.sign(r.amount), ...(route === 'personal' ? { project: personal } : route === 'draw' && (!r.project || r.project === personal) ? { project: business } : {}) });
  }

  async function save() {
    setSaving(true);
    const lines: BankLine[] = [];
    const expenses: Expense[] = [];
    const draws: Draw[] = [];
    const invoices: Invoice[] = [];
    let common = [...p.common];
    const touched = new Map<string, CommonExpense>();
    let sort = p.expenses.reduce((m, e) => Math.max(m, e.sort + 1), 0);
    let lineSort = p.imported.reduce((m, l) => Math.max(m, l.sort + 1), 0);
    const a = (n: string) => acct(n);
    for (const r of live) {
      const line: BankLine = { id: crypto.randomUUID(), account: r.account, date: r.date, kind: r.kind, text: r.text, debit: r.debit, credit: r.credit, balance: r.balance, fp: r.fp, key: r.key, route: r.route, expenseId: null, drawId: null, invoiceId: null, sort: lineSort++ };
      if (r.route === 'expense') {
        const old = r.expenseId ? p.expenses.find((e) => e.id === r.expenseId) : null;
        const e: Expense = old
          ? { ...old, method: old.method || r.method, amount: Math.round(r.amount * 100) / 100, gst: r.gst ? Math.round(r.gst * 100) / 100 : old.gst }
          : { ...newExpense(r.date, sort++), project: r.project, description: r.description, method: r.method || a(r.account)?.method || '', type: r.type, category: r.category, pmtCategory: r.pmtCategory, amount: Math.round(r.amount * 100) / 100, gst: r.gst ? Math.round(r.gst * 100) / 100 : null, notes: [r.notes.trim(), r.text].filter(Boolean).join(' — ') };
        expenses.push(e);
        line.expenseId = e.id;
      }
      if (r.parts.length) {
        line.parts = [];
        for (const x of r.parts) {
          let expenseId: string | null = null;
          if (x.route === 'expense') {
            const e: Expense = { ...newExpense(r.date, sort++), project: x.project, description: x.description, method: r.method || a(r.account)?.method || '', type: x.type, category: x.category, pmtCategory: x.pmtCategory, amount: Math.round(x.amount * 100) / 100, gst: partGst(x) ? Math.round(partGst(x) * 100) / 100 : null, notes: [r.notes.trim(), `${r.text} (part of ${money(r.total)})`].filter(Boolean).join(' — ') };
            expenses.push(e);
            expenseId = e.id;
          }
          // V20-517: a part that's a draw goes to Draws, for its own amount.
          let drawId: string | null = null;
          if (x.route === 'draw') {
            const d: Draw = { id: crypto.randomUUID(), project: x.project, date: r.date, description: x.description, amount: Math.round(Math.abs(x.amount) * 100) / 100, notes: [r.notes.trim(), `${r.text} (part of ${money(r.total)})`].filter(Boolean).join(' — '), bankLineId: line.id, sort: draws.length };
            draws.push(d);
            drawId = d.id;
          }
          line.parts.push({ route: x.route, amount: x.amount, expenseId, drawId, project: x.project, description: x.description, type: x.type, category: x.category, pmtCategory: x.pmtCategory, gst: x.gst });
        }
      }
      if (r.route === 'draw') {
        const d: Draw = { id: crypto.randomUUID(), project: r.project, date: r.date, description: r.description, amount: Math.round(r.amount * 100) / 100, notes: r.notes.trim(), bankLineId: line.id, sort: draws.length };
        draws.push(d);
        line.drawId = d.id;
      } else if (r.route === 'income' && r.invoiceId) {
        const inv = p.invoices.find((i) => i.id === r.invoiceId);
        if (inv && !inv.datePaid) invoices.push({ ...inv, datePaid: r.date });
        line.invoiceId = r.invoiceId;
      }
      if (r.route === 'income' || r.route === 'interest') line.income = { project: r.project, description: r.description, gst: r.route === 'income' ? Math.round(r.gst * 100) / 100 : 0, notes: r.notes.trim() };
      if (r.route === 'transfer' && r.description.trim()) line.description = r.description.trim();
      // V20-520: a Personal line keeps its own filing (two charges from one merchant can be filed differently).
      // V20-521 (Dan): every line keeps every box you filled (a draw or deposit's type / group / category too).
      line.filed = { project: r.project, description: r.description, type: r.type, category: r.category, pmtCategory: r.pmtCategory, notes: r.notes.trim() };
      const c = learn(r, common, r.parts, r.total);
      if (c) {
        common = common.some((x) => x.id === c.id) ? common.map((x) => (x.id === c.id ? c : x)) : [...common, c];
        touched.set(c.id, c);
      }
      lines.push(line);
    }
    const changedProfile = profile && (profile.fyEnd !== fyEnd || profile.personalDivision !== personal || JSON.stringify(profile.divisions ?? []) !== JSON.stringify(divs)) ? { ...profile, fyEnd, personalDivision: personal, divisions: divs } : null;
    // V20-508: an account you added that no line uses isn't saved (a leftover from trying Start from scratch).
    // Budget audit: each Budget line takes the latest amount the bank charged for it.
    const budgetLines = new Map<string, BudgetLine>();
    for (const r of [...live].sort((a, b) => a.date.localeCompare(b.date))) {
      const b = r.budget?.apply ? p.budget.find((x) => x.id === r.budget!.lineId) : undefined;
      // V20-488: a bill missing its group / category takes the charge's.
      if (b) budgetLines.set(b.id, { ...b, amount: Math.round(Math.abs(r.total) * 100) / 100, category: b.category || r.category, pmtCategory: b.pmtCategory || r.pmtCategory });
    }
    const removeLines = live.filter((r) => r.route === 'expense' && r.replacesLine && lines.some((l) => l.fp === r.fp && l.expenseId === r.expenseId)).map((r) => r.replacesLine as string);
    const keepAccounts = accounts.filter((a) => p.accounts.some((x) => x.id === a.id) || lines.some((l) => l.account === a.number));
    await p.onSave({ accounts: keepAccounts, lines, expenses, draws, common: [...touched.values()], invoices, profile: changedProfile, budgetLines: [...budgetLines.values()], removeLines });
    setSaving(false);
    clearDraft();
    p.onClose();
    p.onDone?.();
  }

  async function saveSaved() {
    setSaving(true);
    const lines: BankLine[] = [];
    const expenses: Expense[] = [];
    const draws: Draw[] = [];
    const removeExpenses: string[] = [];
    const removeDraws: string[] = [];
    let common = [...p.common];
    const touched = new Map<string, CommonExpense>();
    let sort = p.expenses.reduce((m, e) => Math.max(m, e.sort + 1), 0);
    for (const r of changed) {
      const line = p.imported.find((l) => l.fp === r.fp);
      if (!line) continue;
      const next: BankLine = { ...line, route: r.route, expenseId: null, drawId: null, parts: undefined };
      const method = r.method || acct(r.account)?.method || '';
      const oldE = line.expenseId ? p.expenses.find((e) => e.id === line.expenseId) : undefined;
      if (r.route === 'expense') {
        const e: Expense = { ...(oldE ?? newExpense(r.date, sort++)), project: r.project, description: r.description, method, type: r.type, category: r.category, pmtCategory: r.pmtCategory, amount: Math.round(r.amount * 100) / 100, gst: r.gst ? Math.round(r.gst * 100) / 100 : null, notes: [r.notes.trim(), r.text].filter(Boolean).join(' — ') };
        expenses.push(e);
        next.expenseId = e.id;
      } else if (oldE) removeExpenses.push(oldE.id);
      const oldParts = new Set((line.parts ?? []).map((x) => x.expenseId).filter((x): x is string => !!x));
      if (r.parts.length) {
        next.parts = [];
        for (const x of r.parts) {
          let expenseId: string | null = null;
          if (x.route === 'expense') {
            const old = oldParts.has(x.id) ? p.expenses.find((e) => e.id === x.id) : undefined;
            const e: Expense = { ...(old ?? newExpense(r.date, sort++)), project: x.project, description: x.description, method, type: x.type, category: x.category, pmtCategory: x.pmtCategory, amount: Math.round(x.amount * 100) / 100, gst: partGst(x) ? Math.round(partGst(x) * 100) / 100 : null, notes: [r.notes.trim(), `${r.text} (part of ${money(r.total)})`].filter(Boolean).join(' — ') };
            expenses.push(e);
            expenseId = e.id;
            oldParts.delete(e.id);
          }
          let drawId: string | null = null;
          if (x.route === 'draw') {
            const d: Draw = { id: crypto.randomUUID(), project: x.project, date: r.date, description: x.description, amount: Math.round(Math.abs(x.amount) * 100) / 100, notes: [r.notes.trim(), `${r.text} (part of ${money(r.total)})`].filter(Boolean).join(' — '), bankLineId: line.id, sort: p.draws.length + draws.length };
            draws.push(d);
            drawId = d.id;
          }
          next.parts.push({ route: x.route, amount: x.amount, expenseId, drawId, project: x.project, description: x.description, type: x.type, category: x.category, pmtCategory: x.pmtCategory, gst: x.gst });
        }
      }
      removeExpenses.push(...oldParts);
      // V20-517: a reopened line's part draws are made again from its parts as they are now.
      removeDraws.push(...(line.parts ?? []).map((x) => x.drawId).filter((x): x is string => !!x));
      const oldD = line.drawId ? p.draws.find((d) => d.id === line.drawId) : undefined;
      if (r.route === 'draw') {
        const d: Draw = { ...(oldD ?? { id: crypto.randomUUID(), sort: p.draws.length + draws.length, bankLineId: line.id }), project: r.project, date: r.date, description: r.description, amount: Math.round(r.amount * 100) / 100, notes: r.notes.trim() };
        draws.push(d);
        next.drawId = d.id;
      } else if (oldD) removeDraws.push(oldD.id);
      next.income = r.route === 'income' || r.route === 'interest' ? { project: r.project, description: r.description, gst: r.route === 'income' ? Math.round(r.gst * 100) / 100 : 0, notes: r.notes.trim() } : undefined;
      next.description = r.route === 'transfer' && r.description.trim() ? r.description.trim() : undefined;
      next.filed = { project: r.project, description: r.description, type: r.type, category: r.category, pmtCategory: r.pmtCategory, notes: r.notes.trim() };
      const c = learn(r, common, r.parts, r.total);
      if (c) {
        common = common.some((x) => x.id === c.id) ? common.map((x) => (x.id === c.id ? c : x)) : [...common, c];
        touched.set(c.id, c);
      }
      lines.push(next);
    }
    await p.onSave({ accounts: [], lines, expenses, draws, common: [...touched.values()], invoices: [], profile: null, removeExpenses, removeDraws, update: true });
    // Only this month's reopened changes are done; a new import in progress stays.
    const done = new Set(changed.map((r) => r.fp));
    setEdits((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !done.has(k))));
    setParts((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !done.has(k))));
    setSaving(false);
  }

  // V20-511: the divisions and fiscal-year controls, shown in Records setup or, when setting up, in their own boxes.
  const divisionsUI = (
    <>
          {/* V20-508 (Dan, Nov 24): Divisions in place of one "Personal division" box: your business, anything you add
              (a brand, a project), and yours, the one personal lines go under. */}
          <div className="bank-fy setup-divs">
            <span>Divisions</span>
            <span className="setup-div-list">
              {[...new Set([business, ...divs, personal].filter(Boolean))].map((d) => (
                <span key={d} className={`setup-div${d === personal ? ' is-mine' : ''}${d === defDiv ? ' is-default' : ''}`}>
                  <button type="button" className="setup-div-pick" aria-pressed={d === defDiv} title={d === defDiv ? 'Every line in this import starts under this division (click again to go back to automatic)' : 'Make this the default for every line in this import'} onClick={() => setDefDiv(d === defDiv ? null : d)}>
                    {d}
                  </button>
                  {d === defDiv ? <em> · default</em> : d === personal ? <em> · personal</em> : d === business ? <em> · business</em> : null}
                  {d !== personal && d !== business && (
                    <button type="button" className="setup-div-x" aria-label={`Remove ${d}`} title="Remove" onClick={() => (setDivs((l) => l.filter((x) => x !== d)), d === defDiv && setDefDiv(null))}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              <span className="setup-div-add">
                <input
                  value={newDiv}
                  onChange={(e) => setNewDiv(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const v = newDiv.trim();
                    if (v && v !== personal && v !== business && !divs.includes(v)) setDivs((l) => [...l, v]);
                    setNewDiv('');
                  }}
                  placeholder="Add a division"
                  size={14}
                  aria-label="Add a division"
                />
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={!newDiv.trim()}
                  onClick={() => {
                    const v = newDiv.trim();
                    if (v && v !== personal && v !== business && !divs.includes(v)) setDivs((l) => [...l, v]);
                    setNewDiv('');
                  }}
                >
                  + Add
                </button>
              </span>
            </span>
          </div>
          <p className="field-hint setup-div-hint">
            {defDiv ? `Every line in this import starts under ${defDiv} (the Common Expenses you've built still file their own merchants). Click it again to go back to automatic.` : 'Click a division to make it the default for every line in this import: a statement that is all one brand, or all personal.'}
          </p>
          <label className="bank-fy">
            Yours (personal)
            <select value={personal} onChange={(e) => setPersonal(e.target.value)} aria-label="Your personal division">
              {[...new Set([personal, ...divs].filter(Boolean))].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="bank-note">Lines filed under it are Personal (not a business expense), and so is any line without a division. Add your own (e.g. your name) above to use it here.</span>
          </label>
    </>
  );
  const fyUI = (
          <label className="bank-fy">
            Fiscal year ends (MM-DD)
            <input value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} pattern="\d\d-\d\d" maxLength={5} size={6} aria-label="Fiscal year ends" />
            <span className="bank-note">FY{fyOf(new Date().toISOString().slice(0, 10), fyEnd)} is this year (named by the year it ends).</span>
          </label>
  );
  // V20-530c: typing lines from scratch (Add a line sits beside Process).
  const scratchRow = books && p.setup && track === 'scratch' && mode === 'new' && parsed.length > 0;
  const statusOf = (r: Draft) => (skip.has(r.fp) ? 'Left out' : STATUS_LABEL[r.status]);

  return (
    <Sheet open={p.open} title={p.setup ? 'Set up your books' : 'Import bank CSV'} onClose={p.onClose} wide>
      <div className={`bank-import${books ? ' is-books' : ''}`}>
        <div className="bank-modes">
          <div className="d26-range budget-views" role="group" aria-label="Import or reopen">
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')} title="Bring in new statements">
              New import
            </button>
            <button type="button" aria-pressed={mode === 'saved'} onClick={() => setMode('saved')} disabled={!p.imported.length} title="Reopen lines already saved to Records, a month at a time">
              Saved · {p.imported.length}
            </button>
          </div>
          {mode === 'saved' && !(books && p.setup) && <MonthNav month={savedMonth} onChange={setSavedMonth} />}
          {/* V20-515 (Dan): on Books the work-in-progress note sits beside New import / Saved. */}
          {books && mode === 'new' && (!p.setup || track === 'csv') && (
            <span className="bank-note">
              {files.length ? 'Your changes are kept until you process or clear.' : 'Nothing goes to Records until you press Process; your work here is kept if you close this.'}
            </span>
          )}
          {/* V20-531 (Dan): Save, Save a copy and Load a copy are icons in the header, beside the ×, on every track. */}
          {books && mode === 'new' && (
            <FormActions
              formId=""
              hideSave
              extra={
                <>
                  {savedFlash && <span className="bank-saved-flash" role="status">Saved</span>}
                  <button type="button" className="icon-btn tool-btn" onClick={() => copyInput.current?.click()} aria-label="Load a copy" title="Load a copy: bring back a copy you saved">
                    <HeadIcon d={UPLOAD_ICON} />
                  </button>
                  <button type="button" className="icon-btn tool-btn" onClick={saveCopy} disabled={!parsed.length} aria-label="Save a copy" title="Save a copy: download everything here, to keep before you Process">
                    <HeadIcon d={DOWNLOAD_ICON} />
                  </button>
                  <button type="button" className="icon-btn tool-btn tool-btn-go" onClick={saveNow} disabled={!parsed.length} aria-label="Save" title="Save: your work here saves as you go; this saves it right now">
                    <HeadIcon d={SAVE_ICON} />
                  </button>
                  <input
                    ref={copyInput}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void loadCopy(f);
                    }}
                  />
                </>
              }
            />
          )}
          {onlyFp && (
            <button type="button" className="btn btn-quiet" onClick={() => setOnlyFp(null)} title="Show every line again">
              The source line · Show all
            </button>
          )}
          {mode === 'saved' && rows.length > 0 && (
            <div className="area-filter pill-row bank-acct-pills" role="group" aria-label="Account">
              <button type="button" className="area-pill" aria-pressed={!fAccount} onClick={() => setFAccount('')}>
                All <span className="pill-count">{rows.length}</span>
              </button>
              {accounts
                .filter((a) => rows.some((r) => r.account === a.number))
                .map((a) => (
                  <button key={a.id} type="button" className="area-pill" aria-pressed={fAccount === a.number} title={a.name} onClick={() => setFAccount(fAccount === a.number ? '' : a.number)}>
                    {a.method || a.name} <span className="pill-count">{rows.filter((r) => r.account === a.number).length}</span>
                  </button>
                ))}
            </div>
          )}
          {mode === 'saved' && <span className="bank-note">{rows.length} lines saved{books && p.setup ? '' : ' in this month'}. Change any of them and save again: their expenses and draws update.</span>}
        </div>
        {mode === 'new' && p.setup && (
          <div className="setup-tracks" role="group" aria-label="How do you want to set up?">
            {(
              [
                { id: 'csv', icon: 'M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2zM9 13h6M9 17h6', title: 'Import a bank CSV', hint: 'You bank online: bring in your statements' },
                { id: 'scratch', icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', title: 'Start from scratch', hint: 'New, or no files: type your lines as you go' },
                { id: 'sheet', icon: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14', title: 'Create from a sheet', hint: 'You keep a spreadsheet: fill in the Launch Sheet' }
              ] as { id: Track; icon: string; title: string; hint: string }[]
            ).map((t) => (
              <button key={t.id} type="button" className="setup-track" aria-pressed={track === t.id} onClick={() => setTrack(t.id)}>
                <span className="setup-track-title">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={t.icon} />
                  </svg>
                  {t.title}
                </span>
                <span className="setup-track-hint">{t.hint}</span>
              </button>
            ))}
          </div>
        )}
        {mode === 'new' && p.setup && track === 'sheet' && (
          <div className="bank-setup-form">
            <div className="bank-setup-step">
              <h3 className="card-h">1 · Download the Launch Sheet</h3>
              <p className="field-hint">A blank workbook with LINES, EXPENSES, INCOME, DRAWS and BUDGET tabs. Fill in your month (or paste from the sheet you keep): the columns match. A Balance column works out your opening balance.</p>
              <div className="bank-files">
                <button type="button" className="btn btn-quiet" onClick={p.onDownloadSheet} disabled={!p.onDownloadSheet}>
                  Download the blank sheet
                </button>
              </div>
            </div>
            <div className="bank-setup-step">
              <h3 className="card-h">2 · Import it</h3>
              <p className="field-hint">Bring the filled-in sheet back (.xlsx, or one tab as .csv). You'll see what's in it before anything is added.</p>
              <div className="bank-files">
                <input
                  ref={sheetInput}
                  type="file"
                  accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f && p.onImportSheet) {
                      p.onImportSheet(f);
                      p.onClose();
                    }
                  }}
                />
                <button type="button" className="btn btn-go" onClick={() => sheetInput.current?.click()} disabled={!p.onImportSheet}>
                  Import your sheet
                </button>
              </div>
            </div>
          </div>
        )}
        {mode === 'new' && p.setup && track === 'scratch' && (
          <div className="bank-setup-form">
            <div className="bank-setup-step">
              <h3 className="card-h">1 · Opening balance</h3>
              <p className="field-hint">What was in the business account on the first day you're starting from. Every month after carries on from it.</p>
              <div className="bank-files">
                <input type="month" value={openMonth} onChange={(e) => setOpenMonth(e.target.value)} aria-label="Starting month" />
                <input type="number" step="0.01" inputMode="decimal" value={openAmt} onChange={(e) => setOpenAmt(e.target.value)} placeholder="0.00" aria-label="Opening balance" size={10} />
                <button
                  type="button"
                  className="btn"
                  disabled={!openMonth || openAmt.trim() === '' || Number.isNaN(Number(openAmt))}
                  onClick={() => p.onSetOpening?.(openMonth, Math.round(Number(openAmt) * 100) / 100)}
                >
                  {p.cashBook ? 'Update' : 'Set it'}
                </button>
                {p.cashBook && <span className="bank-note">Set: {money(p.cashBook.opening)} from {p.cashBook.start}.</span>}
              </div>
            </div>
            <div className="bank-setup-step">
              <h3 className="card-h">2 · Your lines</h3>
              <p className="field-hint">Add each expense or deposit: the date, the account, the amount, then where it goes and what it is. Pick a description you've used before and the rest fills in; a new one is remembered for next time. Your work is kept if you close this.</p>
              {/* V20-530 (Dan): the add buttons are here and, once there are lines, under the last line too. */}
              {(
                <div className="bank-files">
                  <button type="button" className="btn btn-go" onClick={addLine} disabled={!accounts.length}>
                    + Add a line
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={addAccount}>
                    + Add an account
                  </button>
                  {!accounts.length && <span className="bank-note">Add an account first (your business account), then your lines.</span>}
                </div>
              )}
            </div>
          </div>
        )}
        {mode === 'new' && (!p.setup || track === 'csv') && (
        <div className="bank-files">
          <input ref={fileInput} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => (void read(e.target.files), (e.target.value = ''))} />
          <button type="button" className="btn btn-go" onClick={() => fileInput.current?.click()}>
            {parsed.length ? 'Add another statement' : 'Choose statements (CSV)'}
          </button>
          {parsed.length > 0 && (
            <button type="button" className="btn btn-quiet" title="Start over: drop these statements and your changes (nothing has been saved)" onClick={clearDraft}>
              Clear
            </button>
          )}
          {!books ? (
            <span className="bank-note">
              {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} · ${parsed.length} lines · your changes are kept until you save or clear` : 'ATB exports: Personal, Mastercard, Business… pick several at once. Nothing goes to Records until you press Save; your work here is kept if you close this.'}
            </span>
          ) : (
            files.length > 0 && <span className="bank-note">{`${files.length} file${files.length > 1 ? 's' : ''} · ${parsed.length} lines`}</span>
          )}
          {errors.map((e) => (
            <p key={e} className="bank-error">
              {e}
            </p>
          ))}
        </div>
        )}
        {/* V20-507: the CSV track works out each account's opening balance from its Balance column, checked row by row. */}
        {mode === 'new' && p.setup && track === 'csv' && parsed.some((l) => !isManual(l.fp)) && (
          <div className="bank-newacct setup-box setup-opening">
            <h3 className="card-h">Set your opening balance</h3>
            {accounts
              .filter((a) => parsed.some((l) => l.account === a.number && !isManual(l.fp)))
              .map((a) => {
                const w = workOpening(parsed.filter((l) => l.account === a.number && !isManual(l.fp)));
                const forBook = a.kind === 'business' || !accounts.some((x) => x.kind === 'business' && parsed.some((l) => l.account === x.number));
                const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
                const set = p.cashBook && w && p.cashBook.start === w.date.slice(0, 7) && Math.abs(p.cashBook.opening - w.opening) < 0.005;
                return (
                  <div key={a.id} className={`setup-opening-row${w && !w.breakAt ? ' is-ok' : ' is-warn'}`}>
                    <span className="setup-opening-acct">{a.method || a.name || last4(a.number)}</span>
                    {w ? (
                      <>
                        <span className="setup-opening-date">{day(w.date)}</span>
                        <span className="setup-opening-amt">{w.owed ? `${money(w.opening)} owed` : money(w.opening)}</span>
                        <span className="setup-opening-check">{w.breakAt ? `Doesn't add up from ${day(w.breakAt)}: check it against your PDF statement` : `✓ All ${w.rows} balances add up`}</span>
                        {forBook && !w.owed && p.onSetOpening && (
                          <button type="button" className="btn btn-go" disabled={!!set} onClick={() => p.onSetOpening?.(w.date.slice(0, 7), w.opening)} title="The Cash Book starts from this">
                            {set ? 'Cash Book set' : 'Use for the Cash Book'}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="setup-opening-check">No Balance column in this file. Type the opening from your PDF statement{a.kind === 'card' ? ' (what you owed)' : ''}.</span>
                        {forBook && p.onSetOpening && (
                          <span className="bank-files">
                            <input type="month" value={openMonth} onChange={(e) => setOpenMonth(e.target.value)} aria-label="Starting month" />
                            <input type="number" step="0.01" inputMode="decimal" value={openAmt} onChange={(e) => setOpenAmt(e.target.value)} placeholder="0.00" aria-label="Opening balance" size={10} />
                            <button type="button" className="btn btn-go" disabled={!openMonth || openAmt.trim() === '' || Number.isNaN(Number(openAmt))} onClick={() => p.onSetOpening?.(openMonth, Math.round(Number(openAmt) * 100) / 100)}>
                              Set it
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* V20-490 (Dan, Nov 23, Books): a statement with an account we haven't seen asks what it is first: its name and
            kind, or "Same as" an account you already have (its lines move there). */}
        {books &&
          !p.setup &&
          accounts
            .filter((a) => !p.accounts.some((x) => x.id === a.id || x.number === a.number))
            .map((a) => {
              const set = (patch: Partial<BankAccount>) => setAccounts((l) => l.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
              const n = parsed.filter((x) => x.account === a.number).length;
              return (
                <div key={a.id} className="bank-newacct">
                  <h3 className="card-h bank-newacct-h">
                    {p.setup ? 'New account' : 'New account in this statement'} · {last4(a.number)} · {n} line{n === 1 ? '' : 's'}
                    {n === 0 && (
                      <button type="button" className="link-btn bank-newacct-x" onClick={() => setAccounts((l) => l.filter((x) => x.id !== a.id))} title="Remove this account (no lines use it)">
                        Remove
                      </button>
                    )}
                  </h3>
                  <p className="field-hint">Which account is this? Name it and say what kind it is (that decides how money in and out is read), or pick the account you already have.</p>
                  <div className="bank-files">
                    <input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. ATB Business" aria-label="Account name" />
                    <input value={a.method} onChange={(e) => set({ method: e.target.value })} placeholder="Short name (ATB B.)" aria-label="Payment method" size={10} />
                    <select value={a.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })} aria-label="Kind">
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {p.accounts.length > 0 && (
                      <select
                        value=""
                        aria-label="Same as an account you have"
                        onChange={(e) => {
                          const to = p.accounts.find((x) => x.id === e.target.value);
                          if (!to) return;
                          setParsed((l) => l.map((x) => (x.account === a.number ? { ...x, account: to.number } : x)));
                          setAccounts((l) => l.filter((x) => x.id !== a.id));
                        }}
                      >
                        <option value="">Same as…</option>
                        {p.accounts.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name || x.method} {last4(x.number)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
        {!(books && p.setup) && (
        <details className="bank-setup" open={accounts.length > p.accounts.length || (p.setup && accounts.length < 2) || undefined}>
          <summary>Records setup · fiscal year ends {fyEnd} · {[...new Set([business, ...divs, personal].filter(Boolean))].length} divisions (personal: {personal}) · {accounts.length} account{accounts.length === 1 ? '' : 's'}</summary>
          {fyUI}
          {divisionsUI}
          {accounts.length > 0 && (
            <table className="bank-accounts">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Name</th>
                  <th>Pmt method</th>
                  <th>Kind</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const set = (patch: Partial<BankAccount>) => setAccounts((l) => l.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
                  return (
                    <tr key={a.id}>
                      <td className="bank-mono">{last4(a.number)}</td>
                      <td>
                        <input value={a.name} onChange={(e) => set({ name: e.target.value })} aria-label="Account name" />
                      </td>
                      <td>
                        <input value={a.method} onChange={(e) => set({ method: e.target.value })} aria-label="Payment method" size={8} />
                      </td>
                      <td>
                        <select value={a.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })} aria-label="Kind">
                          {KINDS.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </details>
        )}
        {/* V20-511 (Dan, Nov 24): setting up, each part is its own box: account type, divisions, fiscal year. */}
        {books && p.setup && mode === 'new' && accounts.some((a) => parsed.some((l) => l.account === a.number) || !p.accounts.some((x) => x.id === a.id)) && (
          <div className="bank-newacct setup-box">
            <h3 className="card-h">Select account type</h3>
            <p className="field-hint">Name each account and say what kind it is: that decides how money in and out is read (a business account's charges are expenses; a personal account's are personal).</p>
            {accounts
              .filter((a) => parsed.some((l) => l.account === a.number) || !p.accounts.some((x) => x.id === a.id))
              .map((a) => {
                const set = (patch: Partial<BankAccount>) => setAccounts((l) => l.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
                const n = parsed.filter((x) => x.account === a.number).length;
                const isNew = !p.accounts.some((x) => x.id === a.id || x.number === a.number);
                return (
                  <div key={a.id} className="bank-files setup-acct-row">
                    <span className="bank-mono setup-acct-num">
                      {last4(a.number)} · {n} line{n === 1 ? '' : 's'}
                    </span>
                    <input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="ATB Business" aria-label="Account name" />
                    <input value={a.method} onChange={(e) => set({ method: e.target.value })} placeholder="Short name (ATB B.)" aria-label="Payment method" size={10} />
                    <select value={a.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })} aria-label="Kind">
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {isNew && n === 0 && (
                      <button type="button" className="link-btn bank-newacct-x" onClick={() => setAccounts((l) => l.filter((x) => x.id !== a.id))} title="Remove this account (no lines use it)">
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
        {books && p.setup && mode === 'new' && (
          <div className="bank-newacct setup-box">
            <h3 className="card-h">Add divisions</h3>
            {divisionsUI}
          </div>
        )}
        {books && p.setup && mode === 'new' && (
          <div className="bank-newacct setup-box">
            <h3 className="card-h">Set your fiscal year end</h3>
            {fyUI}
          </div>
        )}

        {books && rows.length > 0 && (stackOn && stackKey ? (
          <div className="bank-stackbar">
            <h3 className="card-h">
              {stackRows[0]?.description || tidy(stackKey)} · {stackRows.length} line{stackRows.length === 1 ? '' : 's'} · merchant {stackIdx + 1} of {stackList?.length ?? 0}
            </h3>
            <span className="bank-note">Fill in the first line: each empty box fills down to this merchant's other lines. Change any line on its own, then Accept (below).</span>
          </div>
        ) : (
          stackKeys.length > 0 && (
            <div className="bank-stackbar">
              <h3 className="card-h">Merchants + Common Expenses</h3>
              <span className="bank-note">
                {stackKeys.length} merchant{stackKeys.length === 1 ? '' : 's'} to sort. Go one merchant at a time: every line from it together.
              </span>
              <button type="button" className="btn" onClick={() => (setStackList(stackKeys), setStackIdx(0))}>
                Sort by merchant
              </button>
            </div>
          )
        ))}
        {rows.length > 0 && (
          <>
            <div className="budget-stats bank-stats" aria-label="What this import adds">
              <div className="budget-stat budget-stat-total">
                <span className="budget-stat-label">Expenses · {live.filter((r) => r.route === 'expense').length + live.reduce((a, r) => a + r.parts.filter((x) => x.route === 'expense').length, 0)}</span>
                <span className="budget-stat-value">{money(sum('expense'))}</span>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">GST · expenses</span>
                <span className="budget-stat-value">{money(expenseGst)}</span>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">Draws · {live.filter((r) => r.route === 'draw').length}</span>
                <span className="budget-stat-value">{money(sum('draw'))}</span>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">Income · {live.filter((r) => r.route === 'income').length}</span>
                <span className="budget-stat-value">{money(sum('income'))}</span>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">Personal · {live.filter((r) => r.route === 'personal').length}</span>
                <span className="budget-stat-value">{money(sum('personal'))}</span>
              </div>
              {live.some((r) => r.budget) && (
                <div className="budget-stat bank-stat-budget" title="Bills the bank charged at a different amount than Budget plans: ticked ones update Budget when you save">
                  <span className="budget-stat-label">Budget changes</span>
                  <span className="budget-stat-value">
                    {live.filter((r) => r.budget?.apply).length} / {live.filter((r) => r.budget).length}
                  </span>
                </div>
              )}
              {/* V20-495 (Books): To check is a filter: tap to see just the lines with an empty box (parts included). */}
              {books ? (
                <button type="button" className="budget-stat" aria-pressed={fStatus === 'check'} title={fStatus === 'check' ? 'Show every line' : 'Show only the lines with something to fill in'} onClick={() => setFStatus(fStatus === 'check' ? '' : 'check')}>
                  <span className="budget-stat-label">To check</span>
                  <span className="budget-stat-value">{live.filter(needsWork).length}</span>
                </button>
              ) : (
                <div className="budget-stat">
                  <span className="budget-stat-label">To check</span>
                  <span className="budget-stat-value">{live.filter(needsWork).length}</span>
                </div>
              )}
              {fys.length > 0 && (
                <div className="budget-stat">
                  <span className="budget-stat-label">Fiscal year</span>
                  <span className="budget-stat-value">{fys.map((y) => `FY${y}`).join(', ')}</span>
                </div>
              )}
            </div>

            {/* V20-507 (Dan, Nov 24): Type feeds the Budget (the Audit turns every Fixed charge into a budget line), so a
                new merchant's Type is asked for plainly. */}
            {books && live.some((r) => spends(r.route) && !r.type.trim()) && (
              <p className="field-hint setup-type-hint">
                <strong>Type builds your Budget.</strong> Fixed: it comes every month (rent, a phone, a subscription), and the Budget Audit turns it into a budget line. Variable: it changes (fuel, groceries, a dinner).
              </p>
            )}
            <div className="task-scroll bank-scroll">
              <table className="task-table budget-table bank-table">
                <thead>
                  <tr>
                    <th className="col-center" title="Untick to leave a line out of this import">✓</th>
                    <th className="col-date">Date</th>
                    <th>Account</th>
                    {/* V20-471 (Dan, Nov 23): Books drops Bank text (it fills Description; hover a description to see it). */}
                    {!books && <th>Bank text</th>}
                    <th>Goes to</th>
                    <th>Division</th>
                    <th className="col-task">Description</th>
                    <th>Type</th>
                    <th>Group</th>
                    <th>Category</th>
                    <th className="col-amount">Amount</th>
                    <th className="col-amount">GST</th>
                    <th>Notes</th>
                    <th>Status</th>
                  </tr>
                  <tr className="bank-filters">
                    <th />
                    <th />
                    <th>
                      <select value={fAccount} onChange={(e) => setFAccount(e.target.value)} aria-label="Filter by account">
                        <option value="">All</option>
                        {accounts
                          .filter((a) => parsed.some((l) => l.account === a.number))
                          .map((a) => (
                            <option key={a.id} value={a.number}>
                              {a.method || a.name}
                            </option>
                          ))}
                      </select>
                    </th>
                    {!books && (
                      <th>
                        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search lines" />
                      </th>
                    )}
                    <th>
                      <select value={fRoute} onChange={(e) => setFRoute(e.target.value as Route | '')} aria-label="Filter by where it goes">
                        <option value="">All</option>
                        {ROUTES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </th>
                    {books ? (
                      <>
                        <th />
                        <th>
                          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search lines" />
                        </th>
                        <th colSpan={6} />
                      </>
                    ) : (
                      <th colSpan={8} />
                    )}
                    <th>
                      <select value={fStatus} onChange={(e) => setFStatus(e.target.value as Status | '')} aria-label="Filter by status">
                        <option value="">All</option>
                        {(Object.keys(STATUS_LABEL) as Status[])
                          .filter((s) => s !== 'duplicate' || showDup)
                          .map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                      </select>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => {
                    const off = r.status === 'duplicate' || skip.has(r.fp);
                    const quiet = r.route === 'transfer' || r.route === 'interest' || r.route === 'personal';
                    const others = commonFor(p.common, r.key, acct(r.account)?.kind === 'personal', r.total).slice(0, 8);
                    return (
                      <Fragment key={r.fp}>
                      <tr className={`task-row bank-row is-${r.route} st-${r.status}${needsWork(r) ? ' needs-work' : ''}${off ? ' is-off' : ''}${quiet ? ' is-quiet' : ''}${i % 2 ? ' is-alt' : ''}`}>
                        <td className="col-center">
                          <input
                            type="checkbox"
                            checked={!off}
                            hidden={mode === 'saved'}
                            disabled={r.status === 'duplicate'}
                            aria-label="Include this line"
                            onChange={(e) =>
                              setSkip((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.delete(r.fp);
                                else n.add(r.fp);
                                return n;
                              })
                            }
                          />
                        </td>
                        {isManual(r.fp) ? (
                          <>
                            <td className="col-date">
                              <input type="date" value={r.date} onChange={(e) => e.target.value && setLine(r.fp, { date: e.target.value })} aria-label="Date" />
                            </td>
                            <td>
                              <select value={r.account} onChange={(e) => setLine(r.fp, { account: e.target.value })} aria-label="Account">
                                {accounts.map((a) => (
                                  <option key={a.id} value={a.number}>
                                    {a.method || a.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="col-date">{dayLabel(r.date)}</td>
                            <td className="bank-mono">{acct(r.account)?.method || last4(r.account)}</td>
                          </>
                        )}
                        {!books && (
                          <td className="bank-text" title={r.text}>
                            {r.text}
                          </td>
                        )}
                        <td>
                          <select value={r.route} disabled={off} onChange={(e) => setRoute(r, e.target.value as Route)} aria-label="Goes to" title={ROUTES.find((x) => x.id === r.route)?.hint}>
                            {ROUTES.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <Pick
                            value={r.project}
                            options={books ? [...divisions, SPLIT] : divisions}
                            accent={SPLIT}
                            disabled={off}
                            onChange={(v) => (v === SPLIT ? addPart(r) : setDivision(r, v))}
                            label="Division"
                            need={spends(r.route)}
                          />
                        </td>
                        <td className="col-task">
                          <div className="bank-desc-wrap" title={books ? r.text : undefined}>
                          {!off && !books && (r.route === 'expense' || r.route === 'personal') && (
                            <button type="button" className="icon-btn bank-split" aria-label="Split this charge" title="Split this charge: add a part under it (another division, or a personal share). The line keeps what's left." onClick={() => addPart(r)}>
                              ↳
                            </button>
                          )}
                          <Pick
                            wide
                            value={r.description}
                            groups={[{ label: 'This merchant', options: [...new Set(others.map((c) => c.description))] }]}
                            options={descriptions}
                            disabled={off}
                            onChange={(v) => setDescription(r, v)}
                            label="Description"
                            need={spends(r.route)}
                          />
                          </div>
                        </td>
                        <td>
                          <Pick value={r.type} options={TYPES} disabled={off} onChange={(v) => edit(r, { type: v.toUpperCase() })} label="Type" need={spends(r.route)} />
                        </td>
                        <td>
                          <Pick value={r.category} options={groups} disabled={off} onChange={(v) => edit(r, { category: v })} label="Group" need={spends(r.route)} />
                        </td>
                        <td>
                          <Pick value={r.pmtCategory} options={cats} disabled={off} onChange={(v) => edit(r, { pmtCategory: v })} label="Category" need={spends(r.route)} />
                        </td>
                        <td className="col-amount" title={r.parts.length ? `What's left of ${money(r.total)} after the parts` : undefined}>
                          {isManual(r.fp) && !r.parts.length ? (
                            <input
                              className={`bank-amt${books && !r.amount ? ' is-need' : ''}`}
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              value={r.amount ? Math.abs(r.amount) : ''}
                              placeholder="0.00"
                              aria-label="Amount"
                              onChange={(e) => setManualAmount(r, e.target.value === '' ? null : Math.abs(Math.round(Number(e.target.value) * 100) / 100))}
                            />
                          ) : (
                            money(r.amount)
                          )}
                          {r.parts.length > 0 && <span className="money-orig">of {money(r.total)}</span>}
                        </td>
                        <td className="col-amount">
                          {spends(r.route) ? (
                            <button
                              type="button"
                              className={`bank-gst${r.gst ? '' : ' is-none'}`}
                              disabled={off}
                              aria-pressed={!!r.gst}
                              aria-label={r.gst ? `GST ${money(r.gst)}: tap to remove` : 'No GST: tap to add it'}
                              title={r.gst ? 'GST: 5% of the total, worked out automatically. Tap to remove it (e.g. a bill your GST number exempts); it’s remembered for this expense.' : 'No GST. Tap to add it back.'}
                              onClick={() => edit(r, { gst: r.gst ? 0 : gstIn(Math.abs(r.amount)) * Math.sign(r.amount) })}
                            >
                              {r.gst ? money(r.gst) : 'No GST'}
                            </button>
                          ) : (
                            ''
                          )}
                        </td>
                        <td>
                          <input className="bank-notes" value={r.notes} disabled={off} onChange={(e) => edit(r, { notes: e.target.value })} aria-label="Notes" placeholder="Notes" />
                        </td>
                        <td>
                          <span className={`bank-status st-${r.status}`} title={r.why}>
                            {statusOf(r)}
                          </span>
                          {books && !off && r.status === 'check' && !blank(r) && (
                            <button type="button" className="btn btn-quiet bank-confirm" onClick={() => confirmLine(r)} title={r.confirm ? 'The guess is right: confirm it' : 'Looks right: confirm it'}>
                              Confirm
                            </button>
                          )}
                          {r.budget && !off && (
                            <label className="bank-budget" title={`Budget plans ${money(r.budget.planned)} for ${r.budget.description}; the bank charged ${money(Math.abs(r.total))}. Ticked: Budget takes the new amount when you save.`}>
                              <input type="checkbox" checked={r.budget.apply} onChange={() => edit(r, { budget: { ...r.budget!, apply: !r.budget!.apply } })} />
                              Budget {money(r.budget.planned)} → {money(Math.abs(r.total))}
                            </label>
                          )}
                        </td>
                      </tr>
                      {!off &&
                        r.parts.map((x) => (
                          <tr key={x.id} className={`task-row bank-row bank-part is-${x.route}${blank(x) ? ' needs-work' : ''}${x.route === 'personal' ? ' is-quiet' : ''}${i % 2 ? ' is-alt' : ''}`}>
                            <td className="col-center">
                              <button type="button" className="icon-btn bank-part-x" aria-label="Remove this part" title="Remove this part (its amount goes back to the line)" onClick={() => setPartsOf(r, r.parts.filter((y) => y.id !== x.id))}>
                                ×
                              </button>
                            </td>
                            <td colSpan={books ? 2 : 3} className="bank-part-label">
                              ↳ part of {money(r.total)}
                            </td>
                            <td>
                              {/* V20-517 (Dan, Nov 24): a part's Goes to has the same list as a line's. */}
                              <select
                                value={x.route}
                                onChange={(e) => {
                                  const route = e.target.value as Route;
                                  setPart(r, x.id, { route, ...(route === 'personal' ? { project: personal } : x.project === personal ? { project: business } : {}), ...(spends(route) ? {} : { gst: false }) });
                                }}
                                aria-label="Part goes to"
                              >
                                {(books ? ROUTES : ROUTES.filter((o) => o.id === 'expense' || o.id === 'personal')).map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <Pick value={x.project} options={books ? [...divisions, SPLIT] : divisions} accent={SPLIT} onChange={(v) => (v === SPLIT ? addPart(r) : setPart(r, x.id, { project: v }))} label="Part division" />
                            </td>
                            <td className="col-task">
                              <Pick wide value={x.description} groups={[{ label: 'This merchant', options: [...new Set(others.map((c) => c.description))] }]} options={descriptions} onChange={(v) => setPartDescription(r, x, v)} label="Part description" />
                            </td>
                            <td>
                              <Pick value={x.type} options={TYPES} onChange={(v) => setPart(r, x.id, { type: v.toUpperCase() })} label="Part type" />
                            </td>
                            <td>
                              <Pick value={x.category} options={groups} onChange={(v) => setPart(r, x.id, { category: v })} label="Part group" />
                            </td>
                            <td>
                              <Pick value={x.pmtCategory} options={cats} onChange={(v) => setPart(r, x.id, { pmtCategory: v })} label="Part category" />
                            </td>
                            <td className="col-amount">
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                className="bank-part-amount"
                                value={x.amount || ''}
                                placeholder="0.00"
                                onChange={(e) => setPart(r, x.id, { amount: Math.round((Number(e.target.value) || 0) * 100) / 100 })}
                                aria-label="Part amount"
                              />
                            </td>
                            <td className="col-amount">
                              {spends(x.route) && (
                                <button type="button" className={`bank-gst${x.gst ? '' : ' is-none'}`} aria-pressed={x.gst} onClick={() => setPart(r, x.id, { gst: !x.gst })} title={x.gst ? 'GST in this part. Tap to remove it.' : 'No GST. Tap to add it back.'}>
                                  {x.gst ? money(partGst(x)) : 'No GST'}
                                </button>
                              )}
                            </td>
                            <td />
                            <td />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bank-foot">
              {dups > 0 && (
                <label className="bank-note">
                  <input type="checkbox" checked={showDup} onChange={(e) => setShowDup(e.target.checked)} /> Show {dups} already imported
                </label>
              )}
              <span className="bank-note">Hover a status to see why a line was routed that way.</span>
              {overSplit.length > 0 && <span className="bank-error bank-inline">{overSplit.length} split{overSplit.length > 1 ? 's add' : ' adds'} up to more than the charge: fix the parts before saving.</span>}
              {mode === 'saved' ? (
              <button type="button" className="btn btn-go" disabled={saving || !changed.length || overSplit.length > 0} onClick={() => void saveSaved()}>
                {saving ? 'Saving…' : changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'No changes yet'}
              </button>
              ) : (
              <>
              {/* V20-512 (Dan): Show all lines sits beside Process while sorting by merchant. */}
              {/* V20-513 (Dan): while sorting by merchant there's no Process: Show all lines first. */}
              {/* V20-524 (Dan): ‹ Back · Skip · Accept sit down here beside Show all lines; Accept is the green one. */}
              {books && stackOn ? (
                <>
                  <button type="button" className="btn btn-quiet" disabled={stackIdx === 0} onClick={() => stackGo(stackIdx - 1)} title="Back to the merchant before">
                    ‹ Back
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={stopStack}>
                    Show all lines
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => stackGo(stackIdx + 1)} title="Leave this merchant as it is and go to the next">
                    Skip ›
                  </button>
                  <button type="button" className="btn btn-go" onClick={() => (stackRows.forEach(confirmLine), stackGo(stackIdx + 1))} title="These lines are right: confirm them and go to the next merchant">
                    Accept
                  </button>
                </>
              ) : (
              <button type="button" className={`btn ${scratchRow ? 'btn-quiet' : 'btn-go'}`} disabled={saving || !live.length || overSplit.length > 0} onClick={() => void save()}>
                {saving ? (books ? 'Processing…' : 'Saving…') : live.length ? (books ? `Process ${live.length} line${live.length === 1 ? '' : 's'}` : `Save ${live.length} line${live.length === 1 ? '' : 's'} to Records`) : 'Nothing new to import'}
              </button>
              )}
              {/* V20-530c (Dan): typing lines from scratch, + Add a line is the green button beside Process (hollow). */}
              {scratchRow && (
                <button type="button" className="btn btn-go bank-foot-pair" onClick={addLine} disabled={!accounts.length}>
                  + Add a line
                </button>
              )}
              </>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
