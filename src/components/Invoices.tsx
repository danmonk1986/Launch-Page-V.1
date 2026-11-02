import { isoDate } from '../lib/launchers';
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { FormActions, HeadIcon, Sheet } from './Sheet';
import { TitleCombo } from './Launchers';
import { AmountInput } from './AmountInput';
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
  nextNumber,
  pastValues,
  startInvoice,
  type Customer,
  type Invoice,
  type InvoiceProfile
} from '../lib/invoices';
import { printInvoice } from '../lib/invoicePrint';

const PLUS = 'M12 5v14M5 12h14';
const PRINT = 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z';
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
  /** Records (Oct 26): the page title and the Expenses | Invoices switch. */
  title?: string;
  /** Records (Nov 1): the view pills, under the header. */
  below?: ReactNode;
};

const shortDate = (s: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '');

/** Invoices (pre-V2, Oct 22): the STARDVST invoice tabs as a page. Totals by fiscal year (ends Sep 30). */
export function InvoicesPage(p: Props) {
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [details, setDetails] = useState(false);
  const thisFy = fiscalYear(isoDate(new Date()))!;
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
    <section className="panel panel-budget panel-records" aria-labelledby="h-invoices">
      <div className="panel-head">
        <h2 id="h-invoices" className="panel-title">
          {p.title ?? 'Invoices'}
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="New invoice" title="New invoice" onClick={() => setEditing(startInvoice(p.invoices, p.customers, isoDate(new Date())))}>
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
      {p.below}

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


/** Money boxes take a number or a formula (=12*8): see AmountInput. */
const NumInput = AmountInput;

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
  const lastKm = last?.trips.find((x) => x.km)?.km ?? null;
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
        void onSave({ ...d, number: d.number.trim() || suggested, extras: d.extras.filter((x) => x.desc.trim()), trips: d.trips.filter((x) => x.km) });
      }}
    >
      <div className="budget-grid">
        <label className="field">
          <span>Customer</span>
          <select
            value={d.customerId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null;
              const c = customers.find((x) => x.id === id);
              // The number follows the customer while it's still the suggested one.
              const auto = !d.number.trim() || d.number.trim() === suggested;
              set({ customerId: id, ...(auto ? { number: c?.code ? nextNumber(others, c.code, year) : '' } : {}) });
            }}
          >
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
          <input
            type="date"
            value={d.start ?? ''}
            onChange={(e) => {
              const start = e.target.value || null;
              // End moves with the start while it's before it (a new invoice starts with end = start).
              set({ start, ...(start && (!d.end || d.end < start) ? { end: start } : {}), trips: d.trips.map((x, i) => (i === 0 && x.date === d.start ? { ...x, date: start } : x)) });
            }}
          />
        </label>
        <label className="field">
          <span>End (last day) · {days} day{days === 1 ? '' : 's'}</span>
          <input type="date" min={d.start ?? undefined} value={d.end ?? ''} onChange={(e) => set({ end: e.target.value || null })} />
        </label>
        <div className="field">
          <span>Job ID</span>
          <TitleCombo value={d.jobId} titles={pastValues(others, d.customerId, 'jobId')} onChange={(v) => set({ jobId: v })} placeholder={last?.jobId || '26-0052'} required={false} label="Job ID" />
        </div>
        <label className="field">
          <span>Description</span>
          <input value={d.description} placeholder="MWD Operations" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="field">
          <span>Operator</span>
          <TitleCombo value={d.operator} titles={pastValues(others, d.customerId, 'operator')} onChange={(v) => set({ operator: v })} placeholder={last?.operator || 'LINEUP Resources Corp'} required={false} label="Operator" />
        </div>
        <div className="field">
          <span>Well</span>
          <TitleCombo value={d.well} titles={pastValues(others, d.customerId, 'well')} onChange={(v) => set({ well: v })} placeholder={last?.well || 'LINEUP 100 HZ CHARL LK 11-20-60-4'} required={false} label="Well" />
        </div>
        <label className="field">
          <span>Day rate ($)</span>
          <NumInput value={d.dayRate} placeholder={last?.dayRate ? `Last: ${last.dayRate}` : '700'} onChange={(v) => set({ dayRate: v })} />
        </label>
        <label className="field">
          <span>Travel rate ($/km)</span>
          <NumInput label="Travel rate per km" value={d.travelRate} placeholder={last?.travelRate ? `Last: ${last.travelRate}` : '1.20'} onChange={(v) => set({ travelRate: v })} />
        </label>
        <div className="field budget-wide">
          <span>Travel (date · km): each prints under its day</span>
          {d.trips.map((x, i) => (
            <div key={i} className="invoice-extra invoice-trip">
              <input
                type="date"
                aria-label="Day travelled"
                min={d.start ?? undefined}
                max={d.end ?? undefined}
                value={x.date ?? ''}
                onChange={(e) => set({ trips: d.trips.map((y, j) => (j === i ? { ...y, date: e.target.value || null } : y)) })}
              />
              <NumInput label="Travel km" value={x.km} placeholder={lastKm ? `Last: ${lastKm}` : '600'} onChange={(v) => set({ trips: d.trips.map((y, j) => (j === i ? { ...y, km: v } : y)) })} />
              <button type="button" className="icon-btn tool-btn" aria-label="Remove this travel" title="Remove" onClick={() => set({ trips: d.trips.filter((_, j) => j !== i) })}>
                <Icon d={CLOSE} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => set({ trips: [...d.trips, { date: d.trips.length ? d.end : d.start, km: d.trips[d.trips.length - 1]?.km ?? lastKm }] })}
          >
            + Add travel
          </button>
        </div>
        {last && (last.dayRate || lastKm) && (d.dayRate === null || !d.trips.some((x) => x.km)) ? (
          <div className="field budget-wide">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() =>
                set({
                  dayRate: d.dayRate ?? last.dayRate,
                  trips: d.trips.some((x) => x.km) ? d.trips : [{ date: d.trips[0]?.date ?? d.start, km: lastKm }],
                  travelRate: d.travelRate ?? last.travelRate,
                  jobId: d.jobId || last.jobId,
                  operator: d.operator || last.operator,
                  well: d.well || last.well
                })
              }
            >
              Use last ({[last.dayRate ? `${money(last.dayRate)}/day` : '', lastKm ? `${lastKm} km × ${money(last.travelRate ?? 0)}` : ''].filter(Boolean).join(', ')}, same job)
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
      {!profile?.business && (
        <div className="reminder-actions">
          <button type="button" className="btn btn-quiet" onClick={onDetails}>
            Add your business details
          </button>
        </div>
      )}
      <FormActions
        formId={formId}
        onDelete={!isNew ? () => void onDelete() : undefined}
        deleteLabel={d.number}
        extra={
          <button
            type="button"
            className="icon-btn tool-btn"
            disabled={!days}
            aria-label="Print / Save PDF and save the invoice"
            title="Print / Save PDF (also saves)"
            onClick={() => {
              // Nov 2: Print also saves, like the Save icon: the invoice opens to print (first, so
              // the browser doesn't block the new tab) and the form saves and closes.
              printInvoice({ ...d, number: d.number.trim() || suggested, trips: d.trips.filter((x) => x.km) }, cust, profile);
              (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
            }}
          >
            <HeadIcon d={PRINT} />
          </button>
        }
      />
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
