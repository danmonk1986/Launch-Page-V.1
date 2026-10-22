/**
 * Invoices (pre-V2, Oct 22): the STARDVST invoice tabs of the Launch Sheet (MS 2026-6…) built in
 * the app. One line per day worked at the day rate, plus travel and any extras; G.S.T. 5%.
 * The fiscal year ends September 30 (FY2027 = Oct 1 2026 – Sep 30 2027).
 * Business details live in the user's data (invoice_profile), never in this code.
 */
import { makeStore } from './store';

export interface InvoiceProfile {
  id: string;
  business: string; // STARDVST LIMITED
  person: string; // Dan Monk
  phone: string;
  email: string;
  web: string;
  gstNumber: string;
  sort: number;
}

export interface Customer {
  id: string;
  name: string;
  /** Invoice prefix: MS = Mostar Directional, SD = Scientific Drilling. */
  code: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  sort: number;
}

export interface Extra {
  desc: string;
  qty: number;
  rate: number;
}

export interface Invoice {
  id: string;
  number: string; // MS 2026-9
  customerId: string | null;
  start: string | null; // YYYY-MM-DD, first day worked
  end: string | null; // last day worked
  jobId: string; // 26-0052
  operator: string; // LINEUP Resources Corp
  well: string; // LINEUP 100 HZ CHARL LK 11-20-60-4
  description: string; // MWD Operations
  dayRate: number | null;
  travelKm: number | null;
  travelRate: number | null;
  extras: Extra[];
  gstRate: number; // 0.05
  datePaid: string | null;
  deposit: number | null;
  notes: string;
  sort: number;
}

export const GST = 0.05;

export function newInvoice(sort: number): Invoice {
  return { id: crypto.randomUUID(), number: '', customerId: null, start: null, end: null, jobId: '', operator: '', well: '', description: 'MWD Operations', dayRate: null, travelKm: null, travelRate: null, extras: [], gstRate: GST, datePaid: null, deposit: null, notes: '', sort };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (s: string) => new Date(`${s}T12:00:00`);

/** Every day worked, start to end inclusive. */
export function daysWorked(inv: Pick<Invoice, 'start' | 'end'>): string[] {
  if (!inv.start || !inv.end || inv.end < inv.start) return [];
  const out: string[] = [];
  for (let d = at(inv.start); iso(d) <= inv.end && out.length < 400; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

export interface Line {
  date: string | null;
  desc: string;
  rate: number;
  total: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The invoice's lines, as the sheet lays them out: day 1, travel, then each day, then extras. */
export function invoiceLines(inv: Invoice): Line[] {
  const days = daysWorked(inv);
  const label = `${inv.description || 'MWD Operations'}${inv.jobId ? ` (${inv.jobId})` : ''}`;
  const rate = inv.dayRate ?? 0;
  const lines: Line[] = days.map((d) => ({ date: d, desc: label, rate, total: rate }));
  if (inv.travelKm && inv.travelRate) {
    const travel: Line = { date: null, desc: `Travel (${inv.travelKm}KMs)`, rate: inv.travelRate, total: r2(inv.travelKm * inv.travelRate) };
    lines.splice(Math.min(1, lines.length), 0, travel);
  }
  for (const x of inv.extras) if (x.desc.trim()) lines.push({ date: null, desc: x.desc.trim(), rate: x.rate, total: r2((x.qty || 1) * x.rate) });
  return lines;
}

export function invoiceTotals(inv: Invoice) {
  const total = r2(invoiceLines(inv).reduce((a, l) => a + l.total, 0));
  const gst = r2(total * (inv.gstRate ?? GST));
  return { total, gst, subTotal: r2(total + gst) };
}

/** Days worked in each month ("July 3, August 15"), for the books. */
export function daysByMonth(inv: Invoice): { month: string; days: number }[] {
  const m = new Map<string, number>();
  for (const d of daysWorked(inv)) {
    const k = at(d).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([month, days]) => ({ month, days }));
}

/** The fiscal year an invoice belongs to, by its last day: FY2027 = Oct 1 2026 – Sep 30 2027. */
export function fiscalYear(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const d = at(dateIso);
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}
export const fyLabel = (fy: number) => `FY${fy} (Oct ${fy - 1} – Sep ${fy})`;

/** Next number for a customer: their code + the calendar year + the next sequence (MS 2026-9). */
export function nextNumber(list: Invoice[], code: string, year: number) {
  const prefix = `${code.trim().toUpperCase()} ${year}-`;
  const seq = list.map((i) => i.number.trim().toUpperCase()).filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length)) || 0);
  return `${prefix}${(seq.length ? Math.max(...seq) : 0) + 1}`;
}

/** The last invoice for a customer: its rates are suggested on the next one. */
export const lastFor = (list: Invoice[], customerId: string | null) =>
  customerId ? [...list].filter((i) => i.customerId === customerId).sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''))[0] ?? null : null;

export const money = (x: number) => x.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
export const longDate = (s: string) => at(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ---------- Storage: each row keeps its fields in `data` (0029) ----------

type Row = { id: string; data: Record<string, unknown>; sort: number };
function jsonStore<T extends { id: string; sort: number }>(table: string, localKey: string, fill: (d: Record<string, unknown>) => Omit<T, 'id' | 'sort'>) {
  return makeStore<T, Row>({
    table,
    localKey,
    orderBy: 'sort',
    script: 'supabase/migrations/0029_invoices.sql',
    seed: () => [],
    toRow: (t) => {
      const { id, sort, ...data } = t;
      return { id, data, sort };
    },
    fromRow: (r) => ({ ...fill(r.data ?? {}), id: r.id, sort: r.sort ?? 0 }) as T
  });
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);

export const invoiceStore = jsonStore<Invoice>('invoices', 'launchpage.invoices.v1', (d) => ({
  number: s(d.number),
  customerId: s(d.customerId) || null,
  start: s(d.start) || null,
  end: s(d.end) || null,
  jobId: s(d.jobId),
  operator: s(d.operator),
  well: s(d.well),
  description: s(d.description) || 'MWD Operations',
  dayRate: n(d.dayRate),
  travelKm: n(d.travelKm),
  travelRate: n(d.travelRate),
  extras: Array.isArray(d.extras) ? (d.extras as Extra[]) : [],
  gstRate: n(d.gstRate) ?? GST,
  datePaid: s(d.datePaid) || null,
  deposit: n(d.deposit),
  notes: s(d.notes)
}));

export const customerStore = jsonStore<Customer>('invoice_customers', 'launchpage.invoice-customers.v1', (d) => ({
  name: s(d.name),
  code: s(d.code),
  address: s(d.address),
  city: s(d.city),
  phone: s(d.phone),
  email: s(d.email)
}));

export const profileStore = jsonStore<InvoiceProfile>('invoice_profile', 'launchpage.invoice-profile.v1', (d) => ({
  business: s(d.business),
  person: s(d.person),
  phone: s(d.phone),
  email: s(d.email),
  web: s(d.web),
  gstNumber: s(d.gstNumber)
}));

export const emptyProfile = (): InvoiceProfile => ({ id: crypto.randomUUID(), business: '', person: '', phone: '', email: '', web: '', gstNumber: '', sort: 0 });
