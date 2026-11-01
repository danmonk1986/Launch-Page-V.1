import { useMemo, useState } from 'react';
import { money } from '../lib/budget';
import { fyRange, gstCollected, tidy, type BankAccount, type BankLine, type Draw } from '../lib/bank';
import { daysWorked, invoiceTotals, type Customer, type Invoice } from '../lib/invoices';
import type { Expense } from '../lib/expenses';
import { MONTHS } from '../lib/repeat';
import { dayLabel } from './Expenses';

type Props = {
  lines: BankLine[];
  accounts: BankAccount[];
  invoices: Invoice[];
  customers: Customer[];
  expenses: Expense[];
  draws: Draw[];
  fy: number;
  fyEnd: string;
  /** The personal division (DANMONK26): its expenses are counted apart from the business's. */
  personal: string;
  search: string;
  onSaveLine: (l: BankLine) => Promise<void>;
  onSaveInvoice: (i: Invoice) => Promise<void>;
};

const monthOf = (iso: string) => iso.slice(0, 7);
const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/**
 * Records → Income (Nov 1, V20-015): money in for a fiscal year, a line per deposit or interest
 * payment from the bank imports, each linked to the invoice it pays (picked here when the import
 * couldn't match it), with the GST it collected; and the old Launch Sheet INCOME tab, by month:
 * days invoiced, invoiced, received, business and personal expenses, draws, and draws less expenses.
 */
export function IncomeView(p: Props) {
  const range = fyRange(p.fy, p.fyEnd);
  const inFy = (d: string | null | undefined) => !!d && d >= range.from && d <= range.to;
  const needle = p.search.trim().toLowerCase();
  const acct = (n: string) => p.accounts.find((a) => a.number === n);
  const invoiceOf = (id: string | null) => (id ? p.invoices.find((i) => i.id === id) ?? null : null);
  const customerOf = (i: Invoice | null) => (i?.customerId ? p.customers.find((c) => c.id === i.customerId)?.name ?? '' : '');

  const moneyIn = useMemo(
    () =>
      p.lines
        .filter((l) => (l.route === 'income' || l.route === 'interest') && inFy(l.date))
        .map((l) => {
          const inv = invoiceOf(l.invoiceId);
          const amount = l.credit ?? -(l.debit ?? 0);
          return {
            line: l,
            inv,
            amount,
            project: l.income?.project ?? '',
            description: l.income?.description || (inv ? `${customerOf(inv) || 'Invoice'} · ${inv.number}` : l.route === 'interest' ? 'Interest' : tidy(l.key)),
            gst: l.income?.gst ?? (l.route === 'income' ? (inv ? invoiceTotals(inv).gst : gstCollected(amount)) : 0)
          };
        })
        .filter((r) => !needle || [r.description, r.project, r.inv?.number ?? '', String(r.amount), r.line.text].some((v) => v.toLowerCase().includes(needle)))
        .sort((a, b) => a.line.date.localeCompare(b.line.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.lines, p.invoices, p.customers, range.from, range.to, needle]
  );

  const fyInvoices = p.invoices.filter((i) => inFy(i.end ?? i.start));
  const received = moneyIn.reduce((a, r) => a + r.amount, 0);
  const gst = moneyIn.reduce((a, r) => a + r.gst, 0);
  const invoiced = fyInvoices.reduce((a, i) => a + invoiceTotals(i).total, 0);
  const unpaid = p.invoices.filter((i) => !i.datePaid);
  const owed = unpaid.reduce((a, i) => a + invoiceTotals(i).subTotal, 0);
  const isPersonal = (e: Expense) => e.project.trim().toUpperCase() === p.personal.trim().toUpperCase();
  const fyExpenses = p.expenses.filter((e) => inFy(e.date));
  const business = fyExpenses.filter((e) => !isPersonal(e)).reduce((a, e) => a + (e.amount ?? 0), 0);
  const fyDraws = p.draws.filter((d) => inFy(d.date));
  const drawn = fyDraws.reduce((a, d) => a + d.amount, 0);

  // The old INCOME tab: one row per month of the fiscal year.
  const months: string[] = [];
  for (let d = new Date(`${range.from}T12:00`); monthOf(d.toLocaleDateString('en-CA')) <= monthOf(range.to); d.setMonth(d.getMonth() + 1)) months.push(monthOf(d.toLocaleDateString('en-CA')));
  const byMonth = months.map((m) => {
    const days = p.invoices.reduce((a, i) => a + daysWorked(i).filter((d) => monthOf(d) === m).length, 0);
    const inv = p.invoices.filter((i) => monthOf(i.end ?? i.start ?? '') === m).reduce((a, i) => a + invoiceTotals(i).total, 0);
    const rec = moneyIn.filter((r) => monthOf(r.line.date) === m).reduce((a, r) => a + r.amount, 0);
    const exp = p.expenses.filter((e) => monthOf(e.date) === m);
    const biz = exp.filter((e) => !isPersonal(e)).reduce((a, e) => a + (e.amount ?? 0), 0);
    const mine = exp.filter(isPersonal).reduce((a, e) => a + (e.amount ?? 0), 0);
    const dr = p.draws.filter((d) => monthOf(d.date) === m).reduce((a, d) => a + d.amount, 0);
    return { m, days, inv, rec, biz, mine, dr };
  });
  const any = byMonth.some((r) => r.days || r.inv || r.rec || r.biz || r.mine || r.dr);

  /** Typing in a cell: kept here until it's left, then saved on the line. */
  const [draft, setDraft] = useState<Record<string, { project?: string; description?: string; notes?: string }>>({});
  const save = (l: BankLine, patch: Partial<NonNullable<BankLine['income']>>) => {
    const cur = moneyIn.find((r) => r.line.id === l.id);
    void p.onSaveLine({ ...l, income: { project: cur?.project ?? '', description: cur?.description ?? '', gst: cur?.gst ?? 0, notes: l.income?.notes ?? '', ...l.income, ...patch } });
  };
  const cell = (r: (typeof moneyIn)[number], k: 'project' | 'description' | 'notes', wide = false) => (
    <input
      className={wide ? 'bank-desc income-cell' : 'income-cell'}
      value={draft[r.line.id]?.[k] ?? (k === 'notes' ? r.line.income?.notes ?? '' : r[k])}
      onChange={(e) => setDraft((m) => ({ ...m, [r.line.id]: { ...m[r.line.id], [k]: e.target.value } }))}
      onBlur={() => {
        const v = draft[r.line.id]?.[k];
        if (v !== undefined) save(r.line, { [k]: v });
      }}
      aria-label={k}
      placeholder={k === 'notes' ? 'Notes' : '—'}
    />
  );
  /** Link a deposit to the invoice it pays: the invoice is marked paid that day (and its GST used). */
  async function link(l: BankLine, invoiceId: string) {
    const inv = invoiceOf(invoiceId);
    const old = invoiceOf(l.invoiceId);
    if (old && old.id !== invoiceId && old.datePaid === l.date) await p.onSaveInvoice({ ...old, datePaid: null });
    await p.onSaveLine({ ...l, invoiceId: inv?.id ?? null, income: { project: l.income?.project ?? '', description: inv ? `${customerOf(inv) || 'Invoice'} · ${inv.number}` : l.income?.description ?? '', gst: inv ? invoiceTotals(inv).gst : gstCollected(l.credit ?? 0), notes: l.income?.notes ?? '' } });
    if (inv && !inv.datePaid) await p.onSaveInvoice({ ...inv, datePaid: l.date });
  }

  return (
    <div className="expenses">
      <div className="budget-stats" aria-label="Income this fiscal year">
        <div className="budget-stat budget-stat-total" title={`${range.from} – ${range.to}`}>
          <span className="budget-stat-label">Received · FY{p.fy}</span>
          <span className="budget-stat-value">{money(received)}</span>
        </div>
        <div className="budget-stat" title="GST collected in the deposits (what you'll remit)">
          <span className="budget-stat-label">GST collected</span>
          <span className="budget-stat-value">{money(gst)}</span>
        </div>
        <div className="budget-stat" title="Invoices ending in this fiscal year, before GST">
          <span className="budget-stat-label">Invoiced · FY{p.fy}</span>
          <span className="budget-stat-value">{money(invoiced)}</span>
        </div>
        <div className="budget-stat" title={unpaid.map((i) => i.number).join(', ') || 'Every invoice is paid'}>
          <span className="budget-stat-label">Not paid yet · {unpaid.length}</span>
          <span className="budget-stat-value">{money(owed)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Business expenses</span>
          <span className="budget-stat-value">{money(business)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Draws</span>
          <span className="budget-stat-value">{money(drawn)}</span>
        </div>
      </div>

      <h3 className="records-sub">Money in</h3>
      {moneyIn.length === 0 ? (
        <p className="panel-empty">No deposits in FY{p.fy} yet. Import a business account statement (Import CSV): client payments and interest land here.</p>
      ) : (
        <div className="task-scroll income-scroll">
          <table className="task-table budget-table expenses-table income-table">
            <thead>
              <tr>
                <th className="col-date">Date</th>
                <th className="col-project">Division</th>
                <th className="col-task">Description</th>
                <th>Invoice</th>
                <th>Account</th>
                <th className="col-amount">Amount</th>
                <th className="col-amount">GST</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {moneyIn.map((r, i) => (
                <tr key={r.line.id} className={`task-row${i % 2 ? ' is-alt' : ''}`} title={r.line.text}>
                  <td className="col-date">{dayLabel(r.line.date)}</td>
                  <td className="col-project">{cell(r, 'project')}</td>
                  <td className="col-task">{cell(r, 'description', true)}</td>
                  <td>
                    {r.line.route === 'income' ? (
                      <select value={r.inv?.id ?? ''} onChange={(e) => void link(r.line, e.target.value)} aria-label="Invoice it pays" title="The invoice this deposit pays: it's marked paid that day">
                        <option value="">{r.inv ? '—' : 'Link invoice…'}</option>
                        {p.invoices
                          .filter((x) => !x.datePaid || x.id === r.inv?.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.number} · {money(invoiceTotals(x).subTotal)}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="bank-note">Interest</span>
                    )}
                  </td>
                  <td className="bank-mono">{acct(r.line.account)?.method ?? ''}</td>
                  <td className="col-amount">{money(r.amount)}</td>
                  <td className="col-amount">{r.gst ? money(r.gst) : ''}</td>
                  <td>{cell(r, 'notes')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="records-sub">By month</h3>
      {!any ? (
        <p className="panel-empty">Nothing in FY{p.fy} yet.</p>
      ) : (
        <div className="task-scroll income-scroll">
          <table className="task-table budget-table expenses-table income-months">
            <thead>
              <tr>
                <th>Month</th>
                <th className="col-amount">Days invoiced</th>
                <th className="col-amount">Invoiced</th>
                <th className="col-amount">Received</th>
                <th className="col-amount">Business expenses</th>
                <th className="col-amount">Expenses ({p.personal})</th>
                <th className="col-amount">Draws</th>
                <th className="col-amount" title="Draws less your personal expenses">Draws less expenses</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((r, i) => (
                <tr key={r.m} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                  <td>{monthName(r.m)}</td>
                  <td className="col-amount">{r.days || ''}</td>
                  <td className="col-amount">{r.inv ? money(r.inv) : ''}</td>
                  <td className="col-amount">{r.rec ? money(r.rec) : ''}</td>
                  <td className="col-amount">{r.biz ? money(r.biz) : ''}</td>
                  <td className="col-amount">{r.mine ? money(r.mine) : ''}</td>
                  <td className="col-amount">{r.dr ? money(r.dr) : ''}</td>
                  <td className="col-amount">{r.dr || r.mine ? money(r.dr - r.mine) : ''}</td>
                </tr>
              ))}
              <tr className="task-row income-total">
                <td>FY{p.fy}</td>
                <td className="col-amount">{byMonth.reduce((a, r) => a + r.days, 0) || ''}</td>
                <td className="col-amount">{money(byMonth.reduce((a, r) => a + r.inv, 0))}</td>
                <td className="col-amount">{money(received)}</td>
                <td className="col-amount">{money(business)}</td>
                <td className="col-amount">{money(byMonth.reduce((a, r) => a + r.mine, 0))}</td>
                <td className="col-amount">{money(drawn)}</td>
                <td className="col-amount">{money(drawn - byMonth.reduce((a, r) => a + r.mine, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
