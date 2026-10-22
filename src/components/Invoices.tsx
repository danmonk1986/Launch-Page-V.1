import { Fragment, useId, useMemo, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import {
  daysByMonth,
  daysWorked,
  emptyProfile,
  fiscalYear,
  fyLabel,
  invoiceTotals,
  lastFor,
  money,
  newInvoice,
  nextNumber,
  type Customer,
  type Invoice,
  type InvoiceProfile
} from '../lib/invoices';
import { printInvoice } from '../lib/invoicePrint';

const PLUS = 'M12 5v14M5 12h14';
const CLOSE = 'M6 6l12 12M18 6L6 18';
const ID_CARD = 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 10h.01M12 9h5M12 13h5M7 15h3';

type Props = {
  invoices: Invoice[];
  customers: Customer[];
  profile: InvoiceProfile | null;
  onSave: (i: Invoice) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveCustomer: (c: Customer) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
  onSaveProfile: (p: InvoiceProfile) => Promise<void>;
  onClose: () => void;
};

const shortDate = (s: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');

/** Invoices (pre-V2, Oct 22): the STARDVST invoice tabs as a page. Totals by fiscal year (ends Sep 30). */
export function InvoicesPage(p: Props) {
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [details, setDetails] = useState(false);
  const thisFy = fiscalYear(new Date().toISOString().slice(0, 10))!;
  const fys = useMemo(() => [...new Set([thisFy, ...p.invoices.map((i) => fiscalYear(i.end ?? i.start)).filter((x): x is number => x !== null)])].sort((a, b) => b - a), [p.invoices, thisFy]);
  const [fy, setFy] = useState(thisFy);
  const inYear = p.invoices.filter((i) => fiscalYear(i.end ?? i.start) === fy || (!i.end && !i.start && fy === thisFy)).sort((a, b) => (b.end ?? '9').localeCompare(a.end ?? '9'));
  const sum = (f: (i: Invoice) => number) => inYear.reduce((a, i) => a + f(i), 0);
  const totals = {
    days: sum((i) => daysWorked(i).length),
    total: sum((i) => invoiceTotals(i).total),
    gst: sum((i) => invoiceTotals(i).gst),
    sub: sum((i) => invoiceTotals(i).subTotal),
    paid: sum((i) => (i.datePaid ? i.deposit ?? invoiceTotals(i).subTotal : 0))
  };
  const byMonth = new Map<string, Invoice[]>();
  for (const i of inYear) {
    const k = i.end ? new Date(`${i.end}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) : 'No dates yet';
    byMonth.set(k, [...(byMonth.get(k) ?? []), i]);
  }
  const customer = (id: string | null) => p.customers.find((c) => c.id === id) ?? null;

  return (
    <section className="panel panel-budget" aria-labelledby="h-invoices">
      <div className="panel-head">
        <h2 id="h-invoices" className="panel-title">
          Invoices
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="New invoice" title="New invoice" onClick={() => setEditing(newInvoice(p.invoices.length))}>
            <Icon d={PLUS} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Business details and customers" title="Your details and customers" onClick={() => setDetails(true)}>
            <Icon d={ID_CARD} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>

      <div className="budget-stats" aria-label="Fiscal year totals">
        <label className="budget-stat">
          <span className="budget-stat-label">Fiscal year</span>
          <select className="invoice-fy" value={fy} onChange={(e) => setFy(Number(e.target.value))} aria-label="Fiscal year">
            {fys.map((y) => (
              <option key={y} value={y}>
                {fyLabel(y)}
              </option>
            ))}
          </select>
        </label>
        {[
          ['Invoices', String(inYear.length)],
          ['Days', String(totals.days)],
          ['Total', money(totals.total)],
          ['G.S.T.', money(totals.gst)],
          ['Sub total', money(totals.sub)],
          ['Paid', money(totals.paid)],
          ['Owing', money(Math.max(0, totals.sub - totals.paid))]
        ].map(([k, v]) => (
          <div key={k} className="budget-stat">
            <span className="budget-stat-label">{k}</span>
            <span className="budget-stat-value">{v}</span>
          </div>
        ))}
      </div>

      {!p.profile?.business && (
        <p className="panel-empty">
          First time: tap the card icon to add your business details (they print at the top of every invoice) and your customers.
        </p>
      )}

      <div className="task-scroll">
        <table className="task-table budget-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th className="col-task">Job</th>
              <th className="col-center">Dates</th>
              <th className="col-center">Days</th>
              <th className="col-amount">Total</th>
              <th className="col-amount">G.S.T.</th>
              <th className="col-amount">Sub total</th>
              <th className="col-center">Paid</th>
            </tr>
          </thead>
          <tbody>
            {inYear.length === 0 && (
              <tr>
                <td colSpan={9} className="task-empty">
                  No invoices in {fyLabel(fy)} yet. Tap + to make one.
                </td>
              </tr>
            )}
            {[...byMonth].map(([month, list]) => (
              <Fragment key={month}>
                <tr className="task-section">
                  <th colSpan={9} scope="rowgroup">
                    {month} <span className="section-count">{list.length}</span>
                  </th>
                </tr>
                {list.map((i, n) => {
                  const t = invoiceTotals(i);
                  return (
                    <tr key={i.id} className={`task-row${n % 2 ? ' is-alt' : ''}`}>
                      <td>
                        <button type="button" className="task-name" onClick={() => setEditing(i)}>
                          {i.number || 'Draft'}
                        </button>
                      </td>
                      <td>{customer(i.customerId)?.name ?? ''}</td>
                      <td className="col-task">{[i.jobId, i.well].filter(Boolean).join(' · ')}</td>
                      <td className="col-center">{i.start ? `${shortDate(i.start)} – ${shortDate(i.end)}` : ''}</td>
                      <td className="col-center">{daysWorked(i).length || ''}</td>
                      <td className="col-amount">{money(t.total)}</td>
                      <td className="col-amount">{money(t.gst)}</td>
                      <td className="col-amount">{money(t.subTotal)}</td>
                      <td className="col-center">{i.datePaid ? shortDate(i.datePaid) : <span className="status">Owing</span>}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!editing} title={editing && p.invoices.some((x) => x.id === editing.id) ? `Invoice ${editing.number}` : 'New invoice'} wide onClose={() => setEditing(null)}>
        {editing && (
          <InvoiceForm
            key={editing.id}
            invoice={editing}
            isNew={!p.invoices.some((x) => x.id === editing.id)}
            all={p.invoices}
            customers={p.customers}
            profile={p.profile}
            onSave={async (i) => {
              await p.onSave(i);
              setEditing(null);
            }}
            onDelete={async () => {
              await p.onDelete(editing.id);
              setEditing(null);
            }}
            onDetails={() => setDetails(true)}
          />
        )}
      </Sheet>

      <Sheet open={details} title="Your details and customers" wide onClose={() => setDetails(false)}>
        {details && <DetailsForm profile={p.profile} customers={p.customers} onSaveProfile={p.onSaveProfile} onSaveCustomer={p.onSaveCustomer} onDeleteCustomer={p.onDeleteCustomer} onDone={() => setDetails(false)} />}
      </Sheet>
    </section>
  );
}

function num(v: string): number | null {
  const x = Number(v.replace(/[$,\s]/g, ''));
  return v.trim() === '' || !isFinite(x) ? null : x;
}

/**
 * A money/number box that keeps what you type ("1." while typing 1.20) and hands back the number.
 * Oct 22: the boxes showed the parsed number, so the decimal point vanished as you typed it.
 */
function NumInput({ value, onChange, placeholder, label }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string; label?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  // A value set from outside (Use last) shows; one we just typed stays as typed.
  if (num(text) !== value && !(text.trim() === '' && value === null)) {
    const next = value === null ? '' : String(value);
    if (next !== text) setText(next);
  }
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(num(e.target.value));
      }}
    />
  );
}

function InvoiceForm({
  invoice,
  isNew,
  all,
  customers,
  profile,
  onSave,
  onDelete,
  onDetails
}: {
  invoice: Invoice;
  isNew: boolean;
  all: Invoice[];
  customers: Customer[];
  profile: InvoiceProfile | null;
  onSave: (i: Invoice) => Promise<void>;
  onDelete: () => Promise<void>;
  onDetails: () => void;
}) {
  const [d, setD] = useState<Invoice>(invoice);
  const set = (patch: Partial<Invoice>) => setD((x) => ({ ...x, ...patch }));
  const formId = useId();
  const cust = customers.find((c) => c.id === d.customerId) ?? null;
  const others = all.filter((x) => x.id !== d.id);
  const last = lastFor(others, d.customerId);
  const year = d.start ? Number(d.start.slice(0, 4)) : new Date().getFullYear();
  const suggested = cust?.code ? nextNumber(others, cust.code, year) : '';
  const t = invoiceTotals(d);
  const days = daysWorked(d).length;
  return (
    <form
      id={formId}
      className="task-form budget-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ ...d, number: d.number.trim() || suggested, extras: d.extras.filter((x) => x.desc.trim()) });
      }}
    >
      <div className="budget-grid">
        <label className="field">
          <span>Customer</span>
          <select value={d.customerId ?? ''} onChange={(e) => set({ customerId: e.target.value || null })}>
            <option value="">{customers.length ? 'Pick a customer' : 'Add one under your details first'}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.code ? ` (${c.code})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Invoice #</span>
          <input value={d.number} placeholder={suggested || 'MS 2026-9'} onChange={(e) => set({ number: e.target.value })} />
        </label>
        <label className="field">
          <span>Start (first day)</span>
          <input type="date" value={d.start ?? ''} onChange={(e) => set({ start: e.target.value || null })} />
        </label>
        <label className="field">
          <span>End (last day) · {days} day{days === 1 ? '' : 's'}</span>
          <input type="date" min={d.start ?? undefined} value={d.end ?? ''} onChange={(e) => set({ end: e.target.value || null })} />
        </label>
        <label className="field">
          <span>Job ID</span>
          <input value={d.jobId} placeholder={last?.jobId || '26-0052'} onChange={(e) => set({ jobId: e.target.value })} />
        </label>
        <label className="field">
          <span>Description</span>
          <input value={d.description} placeholder="MWD Operations" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="field">
          <span>Operator</span>
          <input value={d.operator} placeholder={last?.operator || 'LINEUP Resources Corp'} onChange={(e) => set({ operator: e.target.value })} />
        </label>
        <label className="field">
          <span>Well</span>
          <input value={d.well} placeholder={last?.well || 'LINEUP 100 HZ CHARL LK 11-20-60-4'} onChange={(e) => set({ well: e.target.value })} />
        </label>
        <label className="field">
          <span>Day rate ($)</span>
          <NumInput value={d.dayRate} placeholder={last?.dayRate ? `Last: ${last.dayRate}` : '700'} onChange={(v) => set({ dayRate: v })} />
        </label>
        <div className="field">
          <span>Travel (km × $/km)</span>
          <div className="time-grid">
            <NumInput label="Travel km" value={d.travelKm} placeholder={last?.travelKm ? `Last: ${last.travelKm}` : '600'} onChange={(v) => set({ travelKm: v })} />
            <NumInput label="Travel rate per km" value={d.travelRate} placeholder={last?.travelRate ? `Last: ${last.travelRate}` : '1.20'} onChange={(v) => set({ travelRate: v })} />
          </div>
        </div>
        {last && (last.dayRate || last.travelKm) && (d.dayRate === null || d.travelKm === null) ? (
          <div className="field budget-wide">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => set({ dayRate: d.dayRate ?? last.dayRate, travelKm: d.travelKm ?? last.travelKm, travelRate: d.travelRate ?? last.travelRate, jobId: d.jobId || last.jobId, operator: d.operator || last.operator, well: d.well || last.well })}
            >
              Use last ({[last.dayRate ? `${money(last.dayRate)}/day` : '', last.travelKm ? `${last.travelKm} km × ${money(last.travelRate ?? 0)}` : ''].filter(Boolean).join(', ')}, same job)
            </button>
          </div>
        ) : null}
        <div className="field budget-wide">
          <span>Extras (subsistence, consulting, other)</span>
          {d.extras.map((x, i) => (
            <div key={i} className="invoice-extra">
              <input aria-label="What" value={x.desc} placeholder="Subsistence" onChange={(e) => set({ extras: d.extras.map((y, j) => (j === i ? { ...y, desc: e.target.value } : y)) })} />
              <NumInput label="How many" value={x.qty || null} placeholder="Qty" onChange={(v) => set({ extras: d.extras.map((y, j) => (j === i ? { ...y, qty: v ?? 0 } : y)) })} />
              <NumInput label="Rate" value={x.rate || null} placeholder="Rate $" onChange={(v) => set({ extras: d.extras.map((y, j) => (j === i ? { ...y, rate: v ?? 0 } : y)) })} />
              <button type="button" className="icon-btn tool-btn" aria-label="Remove this extra" title="Remove" onClick={() => set({ extras: d.extras.filter((_, j) => j !== i) })}>
                <Icon d={CLOSE} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet" onClick={() => set({ extras: [...d.extras, { desc: '', qty: 1, rate: 0 }] })}>
            + Add an extra
          </button>
        </div>
        <label className="field">
          <span>Date paid</span>
          <input type="date" value={d.datePaid ?? ''} onChange={(e) => set({ datePaid: e.target.value || null })} />
        </label>
        <label className="field">
          <span>Deposit ($, if different)</span>
          <NumInput value={d.deposit} placeholder={money(t.subTotal)} onChange={(v) => set({ deposit: v })} />
        </label>
        <label className="field budget-wide">
          <span>Notes</span>
          <input value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>

      <div className="invoice-totals">
        <span>Total {money(t.total)}</span>
        <span>G.S.T. {money(t.gst)}</span>
        <strong>Sub total {money(t.subTotal)}</strong>
        <span>{daysByMonth(d).map((m) => `${m.month.split(' ')[0]} ${m.days}`).join(' · ')}</span>
      </div>
      <div className="reminder-actions">
        {!profile?.business && (
          <button type="button" className="btn btn-quiet" onClick={onDetails}>
            Add your business details
          </button>
        )}
        <button type="button" className="btn" disabled={!days} title="Opens the invoice in a new tab to print or save as PDF" onClick={() => printInvoice({ ...d, number: d.number.trim() || suggested }, cust, profile)}>
          Print / Save PDF
        </button>
      </div>
      <FormActions formId={formId} onDelete={!isNew ? () => void onDelete() : undefined} deleteLabel={d.number} />
    </form>
  );
}

function DetailsForm({
  profile,
  customers,
  onSaveProfile,
  onSaveCustomer,
  onDeleteCustomer,
  onDone
}: {
  profile: InvoiceProfile | null;
  customers: Customer[];
  onSaveProfile: (p: InvoiceProfile) => Promise<void>;
  onSaveCustomer: (c: Customer) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
  /** Save closes the card (Oct 22: it used to stay open, so you had to save, then close). */
  onDone: () => void;
}) {
  const [pr, setPr] = useState<InvoiceProfile>(profile ?? emptyProfile());
  const [list, setList] = useState<Customer[]>(customers);
  const formId = useId();
  const field = (k: keyof Omit<InvoiceProfile, 'id' | 'sort'>, label: string, ph: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={pr[k]} placeholder={ph} onChange={(e) => setPr((x) => ({ ...x, [k]: e.target.value }))} />
    </label>
  );
  const setC = (i: number, patch: Partial<Customer>) => setList((l) => l.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <form
      id={formId}
      className="task-form budget-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSaveProfile(pr);
        for (const c of list) if (c.name.trim()) await onSaveCustomer({ ...c, code: c.code.trim().toUpperCase() });
        onDone();
      }}
    >
      <p className="field-hint">Prints at the top of every invoice. Kept in your account, not in the app's code.</p>
      <div className="budget-grid">
        {field('business', 'Business', 'STARDVST LIMITED')}
        {field('person', 'Name', 'Dan Monk')}
        {field('phone', 'Phone', '403.971.6468')}
        {field('email', 'Email', 'dan@stardvstbrand.com')}
        {field('web', 'Website', 'www.stardvstbrand.com')}
        {field('gstNumber', 'G.S.T. #', '79869 3511 RT0001')}
      </div>
      <h3 className="invoice-sub">Customers</h3>
      {list.map((c, i) => (
        <div key={c.id} className="budget-grid invoice-customer">
          <label className="field">
            <span>Name</span>
            <input value={c.name} placeholder="Mostar Directional Technologies" onChange={(e) => setC(i, { name: e.target.value })} />
          </label>
          <label className="field">
            <span>Invoice code</span>
            <input value={c.code} placeholder="MS" maxLength={4} onChange={(e) => setC(i, { code: e.target.value.toUpperCase() })} />
          </label>
          <label className="field">
            <span>Address</span>
            <input value={c.address} placeholder="3531 78 Avenue SE." onChange={(e) => setC(i, { address: e.target.value })} />
          </label>
          <label className="field">
            <span>City</span>
            <input value={c.city} placeholder="Calgary, AB" onChange={(e) => setC(i, { city: e.target.value })} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input value={c.phone} onChange={(e) => setC(i, { phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input value={c.email} placeholder="timesheet@…" onChange={(e) => setC(i, { email: e.target.value })} />
          </label>
          {customers.some((x) => x.id === c.id) && (
            <div className="field budget-wide">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={async () => {
                  await onDeleteCustomer(c.id);
                  setList((l) => l.filter((x) => x.id !== c.id));
                }}
              >
                Remove {c.name || 'this customer'}
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => setList((l) => [...l, { id: crypto.randomUUID(), name: '', code: '', address: '', city: '', phone: '', email: '', sort: l.length }])}
      >
        + Add a customer
      </button>
      <FormActions formId={formId} />
    </form>
  );
}
