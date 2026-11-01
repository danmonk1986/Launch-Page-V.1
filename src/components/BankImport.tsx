import { useEffect, useMemo, useRef, useState } from 'react';
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
  type AccountKind,
  type BankAccount,
  type BankLine,
  type CommonExpense,
  type Draft,
  type Draw,
  type ParsedLine,
  type Route,
  type Status
} from '../lib/bank';
import { newExpense, type Expense } from '../lib/expenses';
import type { Invoice, InvoiceProfile } from '../lib/invoices';
import { dayLabel } from './Expenses';

export interface ImportResult {
  accounts: BankAccount[];
  lines: BankLine[];
  expenses: Expense[];
  draws: Draw[];
  common: CommonExpense[];
  invoices: Invoice[];
  profile: InvoiceProfile | null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  common: CommonExpense[];
  imported: BankLine[];
  expenses: Expense[];
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
 * A dropdown of every value already in use, plus "New…" to type one that isn't (Nov 1: every
 * column picks, so nothing has to be typed twice). A value typed new stays a text box until it's done.
 */
function Pick(p: { value: string; options: string[]; groups?: { label: string; options: string[] }[]; onChange: (v: string) => void; label: string; disabled?: boolean; wide?: boolean }) {
  const [typing, setTyping] = useState(false);
  const all = new Set([...(p.groups ?? []).flatMap((g) => g.options), ...p.options]);
  if (typing)
    return (
      <input
        autoFocus
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        onBlur={() => setTyping(false)}
        onKeyDown={(e) => e.key === 'Enter' && setTyping(false)}
        aria-label={p.label}
        className={p.wide ? 'bank-desc' : undefined}
      />
    );
  return (
    <select
      value={p.value}
      disabled={p.disabled}
      onChange={(e) => (e.target.value === NEW ? (setTyping(true), p.onChange(p.value)) : p.onChange(e.target.value))}
      aria-label={p.label}
      title={p.value}
      className={p.wide ? 'bank-desc' : undefined}
    >
      <option value="">—</option>
      {p.value && !all.has(p.value) && <option value={p.value}>{p.value}</option>}
      {(p.groups ?? [])
        .filter((g) => g.options.length)
        .map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={g.label + o} value={o}>
                {o}
              </option>
            ))}
          </optgroup>
        ))}
      {p.groups ? (
        <optgroup label="All">
          {p.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </optgroup>
      ) : (
        p.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))
      )}
      <option value={NEW}>＋ New…</option>
    </select>
  );
}
const NEW = '\u0000new';

/** Work in progress (Nov 1): kept on this device until it's saved or cleared, so closing the sheet loses nothing. */
const DRAFT_KEY = 'launchpage.bank-draft.v1';
type Saved = { parsed: ParsedLine[]; files: string[]; edits: Record<string, Partial<Draft>>; skip: string[]; accounts: BankAccount[] };
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
  useEffect(() => {
    try {
      if (parsed.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ parsed, files, edits, skip: [...skip], accounts } satisfies Saved));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* full or blocked: the draft stays in memory */
    }
  }, [parsed, files, edits, skip, accounts]);
  function clearDraft() {
    setParsed([]);
    setFiles([]);
    setEdits({});
    setSkip(new Set());
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
  const base = useMemo(
    () => draft(parsed, { accounts, common: p.common, imported: p.imported, expenses: p.expenses, invoices: p.invoices, owner, business, personal }),
    [parsed, accounts, p.common, p.imported, p.expenses, p.invoices, owner, business, personal]
  );
  const rows = useMemo(() => base.map((d) => ({ ...d, ...edits[d.fp] })), [base, edits]);
  const startedCheck = useMemo(() => new Set(base.filter((d) => d.status === 'check').map((d) => d.fp)), [base]);
  const acct = (n: string) => accounts.find((a) => a.number === n);
  const live = rows.filter((r) => r.status !== 'duplicate' && !skip.has(r.fp));
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
  const sum = (route: Route) => live.filter((r) => r.route === route).reduce((a, r) => a + r.amount, 0);
  const expenseGst = live.filter((r) => r.route === 'expense').reduce((a, r) => a + r.gst, 0);
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
      if (base.find((b) => b.fp === r.fp)?.status !== 'check') return next;
      for (const o of base) {
        if (o.fp === r.fp || o.key !== r.key || o.status !== 'check' || m[o.fp]) continue;
        const { gst, ...rest } = patch;
        next[o.fp] = { ...rest, ...mark, ...(gst === undefined ? {} : { gst: gst ? gstIn(Math.abs(o.amount)) * Math.sign(o.amount) : 0 }) };
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
          : { ...newExpense(r.date, sort++), project: r.project, description: r.description, method: r.method || a(r.account)?.method || '', type: r.type, category: r.category, pmtCategory: r.pmtCategory, amount: Math.round(r.amount * 100) / 100, gst: r.gst ? Math.round(r.gst * 100) / 100 : null, notes: r.text };
        expenses.push(e);
        line.expenseId = e.id;
      } else if (r.route === 'draw') {
        const d: Draw = { id: crypto.randomUUID(), project: r.project, date: r.date, description: r.description, amount: Math.round(r.amount * 100) / 100, notes: '', bankLineId: line.id, sort: draws.length };
        draws.push(d);
        line.drawId = d.id;
      } else if (r.route === 'income' && r.invoiceId) {
        const inv = p.invoices.find((i) => i.id === r.invoiceId);
        if (inv && !inv.datePaid) invoices.push({ ...inv, datePaid: r.date });
        line.invoiceId = r.invoiceId;
      }
      const c = learn(r, common);
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

  const statusOf = (r: Draft) => (skip.has(r.fp) ? 'Left out' : STATUS_LABEL[r.status]);

  return (
    <Sheet open={p.open} title="Import bank CSV" onClose={p.onClose} wide>
      <div className="bank-import">
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
                <span className="budget-stat-label">Expenses · {live.filter((r) => r.route === 'expense').length}</span>
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
                    <th colSpan={7} />
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
                      <tr key={r.fp} className={`task-row bank-row is-${r.route} st-${r.status}${off ? ' is-off' : ''}${quiet ? ' is-quiet' : ''}${i % 2 ? ' is-alt' : ''}`}>
                        <td className="col-center">
                          <input
                            type="checkbox"
                            checked={!off}
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
                          <Pick
                            wide
                            value={r.description}
                            groups={[{ label: 'This merchant', options: [...new Set(others.map((c) => c.description))] }]}
                            options={descriptions}
                            disabled={off}
                            onChange={(v) => setDescription(r, v)}
                            label="Description"
                          />
                        </td>
                        <td>
                          <select value={r.type} disabled={off} onChange={(e) => edit(r, { type: e.target.value })} aria-label="Type">
                            <option value="" />
                            <option value="FIXED">FIXED</option>
                            <option value="VARIABLE">VARIABLE</option>
                          </select>
                        </td>
                        <td>
                          <Pick value={r.category} options={groups} disabled={off} onChange={(v) => edit(r, { category: v })} label="Group" />
                        </td>
                        <td>
                          <Pick value={r.pmtCategory} options={cats} disabled={off} onChange={(v) => edit(r, { pmtCategory: v })} label="Category" />
                        </td>
                        <td className="col-amount">{money(r.amount)}</td>
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
                          <span className={`bank-status st-${r.status}`} title={r.why}>
                            {statusOf(r)}
                          </span>
                        </td>
                      </tr>
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
              <button type="button" className="btn btn-go" disabled={saving || !live.length} onClick={() => void save()}>
                {saving ? 'Saving…' : live.length ? `Save ${live.length} line${live.length === 1 ? '' : 's'} to Records` : 'Nothing new to import'}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
