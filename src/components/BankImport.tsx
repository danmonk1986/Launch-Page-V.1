import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { BUDGET_CATEGORIES, PMT_CATEGORIES, money } from '../lib/budget';
import {
  ROUTES,
  STATUS_LABEL,
  commonFor,
  draft,
  fyOf,
  gstIn,
  hasGst,
  learn,
  parseStatement,
  tidy,
  type AccountKind,
  type BankAccount,
  type BankLine,
  type CommonExpense,
  type Draft,
  type Draw,
  type ParsedLine,
  type Part,
  type Route,
  type Status
} from '../lib/bank';
import { newExpense, type Expense } from '../lib/expenses';
import type { Invoice, InvoiceProfile } from '../lib/invoices';
import { MonthNav, dayLabel } from './Expenses';
import { TitleCombo } from './Launchers';

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
  /** True when this saves changes to lines imported before. */
  update?: boolean;
}

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  common: CommonExpense[];
  imported: BankLine[];
  expenses: Expense[];
  draws: Draw[];
  invoices: Invoice[];
  profile: InvoiceProfile | null;
  onSave: (r: ImportResult) => Promise<void>;
};

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
function Pick(p: { value: string; options: string[]; groups?: { label: string; options: string[] }[]; onChange: (v: string) => void; label: string; disabled?: boolean; wide?: boolean }) {
  const titles = [...new Set([...(p.groups ?? []).flatMap((g) => g.options), ...p.options])];
  if (p.disabled)
    return (
      <span className={`bank-cell-off${p.wide ? ' is-wide' : ''}`} title={p.value}>
        {p.value || '—'}
      </span>
    );
  return (
    <div className={`bank-combo${p.wide ? ' is-wide' : ''}`}>
      <TitleCombo value={p.value} titles={titles} onChange={p.onChange} placeholder="—" required={false} label={p.label} />
    </div>
  );
}

/** Work in progress (Nov 1): kept on this device until it's saved or cleared, so closing the sheet loses nothing. */
const DRAFT_KEY = 'launchpage.bank-draft.v1';
type Saved = { parsed: ParsedLine[]; files: string[]; edits: Record<string, Partial<Draft>>; skip: string[]; accounts: BankAccount[]; parts?: Record<string, Part[]> };
function loadDraft(): Saved | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Saved | null;
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
  const [parsed, setParsed] = useState<ParsedLine[]>(saved?.parsed ?? []);
  const [files, setFiles] = useState<string[]>(saved?.files ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>(saved?.accounts?.length ? saved.accounts : p.accounts);
  const [fyEnd, setFyEnd] = useState(p.profile?.fyEnd ?? '09-30');
  const [personal, setPersonal] = useState(p.profile?.personalDivision || (p.profile?.person ?? '').toUpperCase().replace(/\s+/g, '') || 'PERSONAL');
  // Opening the sheet starts from what's saved (the profile and accounts load after the page).
  const defaultPersonal = p.profile?.personalDivision || (p.profile?.person ?? '').toUpperCase().replace(/\s+/g, '') || 'PERSONAL';
  useEffect(() => {
    if (!p.open) return;
    setFyEnd(p.profile?.fyEnd ?? '09-30');
    setPersonal(defaultPersonal);
    if (!parsed.length) setAccounts(p.accounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.open, p.profile?.id, p.profile?.fyEnd, defaultPersonal]);
  /** Edits made in the table, by line (fingerprint), kept when the accounts change. */
  const [edits, setEdits] = useState<Record<string, Partial<Draft>>>(saved?.edits ?? {});
  const [skip, setSkip] = useState<Set<string>>(new Set(saved?.skip ?? []));
  /** Lines filled in by following another line of the same new merchant (they keep following until edited). */
  const followers = useRef(new Set<string>());
  /** Split charges (Nov 1): the parts under a line, by line. */
  const [parts, setParts] = useState<Record<string, Part[]>>(saved?.parts ?? {});
  useEffect(() => {
    try {
      if (parsed.length || Object.keys(edits).length || Object.keys(parts).length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ parsed, files, edits, skip: [...skip], accounts, parts } satisfies Saved));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* full or blocked: the draft stays in memory */
    }
  }, [parsed, files, edits, skip, accounts, parts]);
  function clearDraft() {
    setParsed([]);
    setFiles([]);
    setEdits({});
    setSkip(new Set());
    setParts({});
    setErrors([]);
    setAccounts(p.accounts);
  }
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
      for (const num of new Set(r.lines.map((l) => l.account))) if (!next.some((a) => a.number === num)) next.push(guessAccount(num, f.name, next.length));
    }
    setParsed(all);
    setFiles(names);
    setErrors(errs);
    setAccounts(next);
  }

  const profile = p.profile;
  const owner = profile?.person ?? '';
  const business = (profile?.business ?? '').replace(/\s+(LIMITED|LTD\.?|INC\.?|CORP\.?)$/i, '');
  const fresh = useMemo(
    () => draft(parsed, { accounts, common: p.common, imported: p.imported, expenses: p.expenses, invoices: p.invoices, owner, business, personal }),
    [parsed, accounts, p.common, p.imported, p.expenses, p.invoices, owner, business, personal]
  );

  /**
   * Saved (Nov 1): reopen a month of lines already imported, in the same table. Each line comes back
   * as it was saved (its expense, draw or parts); saving updates them, adds or removes the expense /
   * draw when where it goes changes, and teaches Common Expenses again.
   */
  const [mode, setMode] = useState<'new' | 'saved'>('new');
  const lastMonth = p.imported.reduce((m, l) => (l.date.slice(0, 7) > m ? l.date.slice(0, 7) : m), '') || new Date().toLocaleDateString('en-CA').slice(0, 7);
  const [savedMonth, setSavedMonth] = useState(lastMonth);
  const savedRows = useMemo<Draft[]>(() => {
    const strip = (notes: string, text: string) => notes.replace(text, '').replace(/\s*\(part of [^)]*\)/, '').replace(/\s*—\s*$/, '').trim();
    return p.imported
      .filter((l) => l.date.slice(0, 7) === savedMonth)
      .sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account) || a.sort - b.sort)
      .map((l) => {
        const a = accounts.find((x) => x.number === l.account);
        const owedAmt = l.debit ?? -(l.credit ?? 0);
        const e = l.expenseId ? p.expenses.find((x) => x.id === l.expenseId) : undefined;
        const d = l.drawId ? p.draws.find((x) => x.id === l.drawId) : undefined;
        const rule = commonFor(p.common, l.key, a?.kind === 'personal')[0];
        const src = e ?? (l.route === 'personal' ? rule : undefined);
        const parts: Part[] | undefined = l.parts?.map((x) => {
          const pe = x.expenseId ? p.expenses.find((y) => y.id === x.expenseId) : undefined;
          return { id: x.expenseId ?? crypto.randomUUID(), route: x.route === 'expense' ? 'expense' : 'personal', project: pe?.project ?? x.project, description: pe?.description ?? x.description, type: pe?.type ?? '', category: pe?.category ?? '', pmtCategory: pe?.pmtCategory ?? '', amount: x.amount, gst: !!pe?.gst };
        });
        return {
          account: l.account, date: l.date, kind: l.kind, text: l.text, debit: l.debit, credit: l.credit, balance: l.balance, fp: l.fp, key: l.key,
          id: l.id,
          route: l.route,
          status: 'saved',
          why: `Saved${e ? ` as ${e.description}` : d ? ` as a draw (${d.description})` : ''}. Change anything and save again.`,
          project: d?.project ?? src?.project ?? (l.route === 'personal' ? personal : ''),
          description: d?.description ?? src?.description ?? tidy(l.key),
          method: e?.method ?? a?.method ?? '',
          type: src?.type ?? '',
          category: src?.category ?? '',
          pmtCategory: src?.pmtCategory ?? '',
          amount: l.route === 'expense' || l.route === 'personal' ? owedAmt : Math.abs(owedAmt),
          gst: e?.gst ?? 0,
          expenseId: l.expenseId,
          invoiceId: l.invoiceId,
          commonId: rule?.id ?? null,
          pairOf: null,
          notes: e ? strip(e.notes, l.text) : d?.notes ?? '',
          savedParts: parts
        } satisfies Draft;
      });
  }, [p.imported, p.expenses, p.draws, p.common, accounts, savedMonth, personal]);
  const base = mode === 'saved' ? savedRows : fresh;
  /**
   * Lines with their splits. A line's parts are the ones made here, or (until then) the split its
   * Common Expense remembers, by the same shares. The main line keeps what the parts don't cover;
   * its GST follows its own share.
   */
  const rows = useMemo(
    () =>
      base.map((d) => {
        const r = { ...d, ...edits[d.fp] };
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
    setPartsOf(r, [...r.parts, { id: crypto.randomUUID(), route: r.route === 'personal' ? 'expense' : 'personal', project: r.route === 'personal' ? business : personal, description: r.description, type: r.type, category: r.category, pmtCategory: r.pmtCategory, amount: 0, gst: r.route === 'personal' }]);
  const setPart = (r: Row, id: string, patch: Partial<Part>) => setPartsOf(r, r.parts.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  /** A Common Expenses pick on a part fills it like a line. */
  function setPartDescription(r: Row, x: Part, description: string) {
    const c = p.common.find((e) => e.description === description);
    setPart(r, x.id, c ? { description, route: c.route === 'personal' ? 'personal' : 'expense', project: c.project, type: c.type, category: c.category, pmtCategory: c.pmtCategory, gst: hasGst(c) } : { description });
  }
  const partGst = (x: Part) => (x.route === 'expense' && x.gst ? gstIn(Math.abs(x.amount)) * Math.sign(x.amount) : 0);
  const startedCheck = useMemo(() => new Set(base.filter((d) => d.status === 'check').map((d) => d.fp)), [base]);
  const acct = (n: string) => accounts.find((a) => a.number === n);
  const live = rows.filter((r) => r.status !== 'duplicate' && !skip.has(r.fp));
  const changed = mode === 'saved' ? rows.filter((r) => edits[r.fp] || parts[r.fp]) : [];
  const dups = rows.filter((r) => r.status === 'duplicate').length;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (showDup || r.status !== 'duplicate') &&
      (!fRoute || r.route === fRoute) &&
      // A line being worked on stays in the Check filter until the filter changes.
      (!fStatus || r.status === fStatus || (fStatus === 'check' && startedCheck.has(r.fp))) &&
      (!fAccount || r.account === fAccount) &&
      (!needle || [r.text, r.description, r.project, r.category, r.pmtCategory].some((v) => v.toLowerCase().includes(needle)))
  );
  const sum = (route: Route) => live.reduce((a, r) => a + (r.route === route ? r.amount : 0) + r.parts.filter((x) => x.route === route).reduce((b, x) => b + x.amount, 0), 0);
  const expenseGst = live.reduce((a, r) => a + (r.route === 'expense' ? r.gst : 0) + r.parts.reduce((b, x) => b + partGst(x), 0), 0);
  const overSplit = live.filter((r) => r.parts.length && (r.total >= 0 ? r.amount < -0.004 : r.amount > 0.004));
  const fys = [...new Set(live.map((r) => fyOf(r.date, fyEnd)))].sort();

  const pick = (f: (c: CommonExpense) => string) => [...new Set([...p.common.map(f), ...p.expenses.map((e) => f(e as unknown as CommonExpense))].map((x) => (x ?? '').trim()).filter(Boolean))].sort();
  const divisions = [...new Set([...pick((c) => c.project), personal, business].filter(Boolean))].sort();
  // The sheet's full lists, in its order, then anything else already in use.
  const groups = [...new Set([...BUDGET_CATEGORIES, ...pick((c) => c.category)])];
  const cats = [...new Set([...PMT_CATEGORIES, ...pick((c) => c.pmtCategory)])];
  const descriptions = [...new Set(p.common.map((c) => c.description))].sort();

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
      if (base.find((b) => b.fp === r.fp)?.status !== 'check') return next;
      for (const o of base) {
        if (o.fp === r.fp || o.key !== r.key || o.status !== 'check' || (m[o.fp] && !followers.current.has(o.fp))) continue;
        followers.current.add(o.fp);
        const { gst, ...rest } = patch;
        next[o.fp] = { ...m[o.fp], ...rest, ...mark, ...(gst === undefined ? {} : { gst: gst ? gstIn(Math.abs(o.amount)) * Math.sign(o.amount) : 0 }) };
      }
      return next;
    });
  /** Typing or picking a description: a Common Expenses entry fills in the rest. */
  function setDescription(r: Draft, description: string) {
    const c = p.common.find((x) => x.description === description);
    if (!c) return edit(r, { description });
    edit(r, {
      description,
      commonId: c.id,
      route: c.route,
      project: c.project,
      type: c.type,
      category: c.category,
      pmtCategory: c.pmtCategory,
      gst: hasGst(c) ? gstIn(Math.abs(r.amount)) * Math.sign(r.amount) : 0,
      status: r.status === 'check' || r.status === 'edited' ? 'common' : r.status
    });
  }
  function setRoute(r: Draft, route: Route) {
    edit(r, { route, gst: route === 'expense' ? r.gst : 0, ...(route === 'personal' ? { project: personal } : route === 'draw' && (!r.project || r.project === personal) ? { project: business } : {}) });
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
          ? { ...old, method: old.method || r.method, gst: old.gst ?? (r.gst || null) }
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
          line.parts.push({ route: x.route, amount: x.amount, expenseId, project: x.project, description: x.description });
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
      const c = learn(r, common, r.parts, r.total);
      if (c) {
        common = common.some((x) => x.id === c.id) ? common.map((x) => (x.id === c.id ? c : x)) : [...common, c];
        touched.set(c.id, c);
      }
      lines.push(line);
    }
    const changedProfile = profile && (profile.fyEnd !== fyEnd || profile.personalDivision !== personal) ? { ...profile, fyEnd, personalDivision: personal } : null;
    await p.onSave({ accounts, lines, expenses, draws, common: [...touched.values()], invoices, profile: changedProfile });
    setSaving(false);
    clearDraft();
    p.onClose();
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
          next.parts.push({ route: x.route, amount: x.amount, expenseId, project: x.project, description: x.description });
        }
      }
      removeExpenses.push(...oldParts);
      const oldD = line.drawId ? p.draws.find((d) => d.id === line.drawId) : undefined;
      if (r.route === 'draw') {
        const d: Draw = { ...(oldD ?? { id: crypto.randomUUID(), sort: p.draws.length + draws.length, bankLineId: line.id }), project: r.project, date: r.date, description: r.description, amount: Math.round(r.amount * 100) / 100, notes: r.notes.trim() };
        draws.push(d);
        next.drawId = d.id;
      } else if (oldD) removeDraws.push(oldD.id);
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

  const statusOf = (r: Draft) => (skip.has(r.fp) ? 'Left out' : STATUS_LABEL[r.status]);

  return (
    <Sheet open={p.open} title="Import bank CSV" onClose={p.onClose} wide>
      <div className="bank-import">
        <div className="bank-modes">
          <div className="d26-range budget-views" role="group" aria-label="Import or reopen">
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')} title="Bring in new statements">
              New import
            </button>
            <button type="button" aria-pressed={mode === 'saved'} onClick={() => setMode('saved')} disabled={!p.imported.length} title="Reopen lines already saved to Records, a month at a time">
              Saved · {p.imported.length}
            </button>
          </div>
          {mode === 'saved' && <MonthNav month={savedMonth} onChange={setSavedMonth} />}
          {mode === 'saved' && <span className="bank-note">{rows.length} lines saved in this month. Change any of them and save again: their expenses and draws update.</span>}
        </div>
        {mode === 'new' && (
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
          <span className="bank-note">
            {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} · ${parsed.length} lines · your changes are kept until you save or clear` : 'ATB exports: Personal, Mastercard, Business… pick several at once. Nothing goes to Records until you press Save; your work here is kept if you close this.'}
          </span>
          {errors.map((e) => (
            <p key={e} className="bank-error">
              {e}
            </p>
          ))}
        </div>
        )}

        <details className="bank-setup" open={accounts.length > p.accounts.length || undefined}>
          <summary>Records setup · fiscal year ends {fyEnd} · personal division {personal} · {accounts.length} account{accounts.length === 1 ? '' : 's'}</summary>
          <label className="bank-fy">
            Fiscal year ends (MM-DD)
            <input value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} pattern="\d\d-\d\d" maxLength={5} size={6} aria-label="Fiscal year ends" />
            <span className="bank-note">FY{fyOf(new Date().toISOString().slice(0, 10), fyEnd)} is this year (named by the year it ends).</span>
          </label>
          <label className="bank-fy">
            Personal division
            <input value={personal} onChange={(e) => setPersonal(e.target.value.toUpperCase())} size={12} aria-label="Personal division" />
            <span className="bank-note">Personal lines, and any line without a division, go under this.</span>
          </label>
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

        {rows.length > 0 && (
          <>
            <div className="budget-stats bank-stats" aria-label="What this import adds">
              <div className="budget-stat budget-stat-total">
                <span className="budget-stat-label">Expenses · {live.filter((r) => r.route === 'expense').length + live.reduce((a, r) => a + r.parts.filter((x) => x.route === 'expense').length, 0)}</span>
                <span className="budget-stat-value">{money(sum('expense'))}</span>
              </div>
              <div className="budget-stat">
                <span className="budget-stat-label">GST in them</span>
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
              <div className="budget-stat">
                <span className="budget-stat-label">To check</span>
                <span className="budget-stat-value">{live.filter((r) => r.status === 'check').length}</span>
              </div>
              {fys.length > 0 && (
                <div className="budget-stat">
                  <span className="budget-stat-label">Fiscal year</span>
                  <span className="budget-stat-value">{fys.map((y) => `FY${y}`).join(', ')}</span>
                </div>
              )}
            </div>

            <div className="task-scroll bank-scroll">
              <table className="task-table budget-table bank-table">
                <thead>
                  <tr>
                    <th className="col-center" title="Untick to leave a line out of this import">✓</th>
                    <th className="col-date">Date</th>
                    <th>Account</th>
                    <th>Bank text</th>
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
                    <th>
                      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search lines" />
                    </th>
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
                    <th colSpan={8} />
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
                    const others = commonFor(p.common, r.key, acct(r.account)?.kind === 'personal').slice(0, 8);
                    return (
                      <Fragment key={r.fp}>
                      <tr className={`task-row bank-row is-${r.route} st-${r.status}${off ? ' is-off' : ''}${quiet ? ' is-quiet' : ''}${i % 2 ? ' is-alt' : ''}`}>
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
                        <td className="col-date">{dayLabel(r.date)}</td>
                        <td className="bank-mono">{acct(r.account)?.method || last4(r.account)}</td>
                        <td className="bank-text" title={r.text}>
                          {r.text}
                        </td>
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
                          <Pick value={r.project} options={divisions} disabled={off} onChange={(v) => edit(r, { project: v })} label="Division" />
                        </td>
                        <td className="col-task">
                          <div className="bank-desc-wrap">
                          {!off && (r.route === 'expense' || r.route === 'personal') && (
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
                          />
                          </div>
                        </td>
                        <td>
                          <Pick value={r.type} options={TYPES} disabled={off} onChange={(v) => edit(r, { type: v.toUpperCase() })} label="Type" />
                        </td>
                        <td>
                          <Pick value={r.category} options={groups} disabled={off} onChange={(v) => edit(r, { category: v })} label="Group" />
                        </td>
                        <td>
                          <Pick value={r.pmtCategory} options={cats} disabled={off} onChange={(v) => edit(r, { pmtCategory: v })} label="Category" />
                        </td>
                        <td className="col-amount" title={r.parts.length ? `What's left of ${money(r.total)} after the parts` : undefined}>
                          {money(r.amount)}
                          {r.parts.length > 0 && <span className="money-orig">of {money(r.total)}</span>}
                        </td>
                        <td className="col-amount">
                          {r.route === 'expense' ? (
                            <button
                              type="button"
                              className={`bank-gst${r.gst ? '' : ' is-none'}`}
                              disabled={off}
                              aria-pressed={!!r.gst}
                              aria-label={r.gst ? `GST ${money(r.gst)}: tap to remove` : 'No GST: tap to add it'}
                              title={r.gst ? 'GST in the total, worked out automatically (total × 5/105). Tap to remove it (e.g. a bill your GST number exempts); it’s remembered for this expense.' : 'No GST. Tap to add it back.'}
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
                        </td>
                      </tr>
                      {!off &&
                        r.parts.map((x) => (
                          <tr key={x.id} className={`task-row bank-row bank-part is-${x.route}${x.route === 'personal' ? ' is-quiet' : ''}${i % 2 ? ' is-alt' : ''}`}>
                            <td className="col-center">
                              <button type="button" className="icon-btn bank-part-x" aria-label="Remove this part" title="Remove this part (its amount goes back to the line)" onClick={() => setPartsOf(r, r.parts.filter((y) => y.id !== x.id))}>
                                ×
                              </button>
                            </td>
                            <td colSpan={3} className="bank-part-label">
                              ↳ part of {money(r.total)}
                            </td>
                            <td>
                              <select value={x.route} onChange={(e) => setPart(r, x.id, { route: e.target.value as Part['route'], ...(e.target.value === 'personal' ? { project: personal } : {}) })} aria-label="Part goes to">
                                <option value="expense">Expense</option>
                                <option value="personal">Personal</option>
                              </select>
                            </td>
                            <td>
                              <Pick value={x.project} options={divisions} onChange={(v) => setPart(r, x.id, { project: v })} label="Part division" />
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
                              {x.route === 'expense' && (
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
              <button type="button" className="btn btn-go" disabled={saving || !live.length || overSplit.length > 0} onClick={() => void save()}>
                {saving ? 'Saving…' : live.length ? `Save ${live.length} line${live.length === 1 ? '' : 's'} to Records` : 'Nothing new to import'}
              </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
