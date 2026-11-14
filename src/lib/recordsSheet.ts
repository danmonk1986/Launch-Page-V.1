/**
 * V20-198 (Dan, Nov 14): ⚙ › Data Management › Export records: the bookkeeping side the Launch Sheet leaves out
 * (Expenses, Draws, Invoices), one .xlsx with a tab each, in the same style as the Launch Sheet.
 */
import { buildXlsx, type SheetSpec } from './xlsx';
import type { Expense } from './expenses';
import type { Draw } from './bank';
import type { Customer, Invoice } from './invoices';

export function downloadRecords(d: { business: string; expenses: Expense[]; draws: Draw[]; invoices: Invoice[]; customers: Customer[]; colors: { purple: string; teal: string } }) {
  const top = (title: string) => [{ text: `${d.business || 'L4UNCH P4GE'} · ${title}`, style: 'title' as const }];
  const byDate = <T extends { date?: string | null }>(a: T, b: T) => (a.date ?? '').localeCompare(b.date ?? '');
  const tabs: SheetSpec[] = [
    {
      name: 'EXPENSES',
      top: top('Expenses'),
      headers: ['Date', 'Division', 'Description', 'Method', 'Type', 'Category', 'Payment category', 'Amount (CAD)', 'GST/HST', 'Foreign', 'Currency', 'Notes'],
      rows: [...d.expenses].sort(byDate).map((e) => [e.date, e.project, e.description, e.method, e.type, e.category, e.pmtCategory, e.amount, e.gst, e.foreign ?? null, e.currency ?? '', e.notes]),
      group: { col: 0, kind: 'month' }
    },
    {
      name: 'DRAWS',
      top: top('Draws'),
      headers: ['Date', 'Division', 'Description', 'Amount', 'Notes'],
      rows: [...d.draws].sort(byDate).map((x) => [x.date, x.project, x.description, x.amount, x.notes]),
      group: { col: 0, kind: 'month' }
    },
    {
      name: 'INVOICES',
      top: top('Invoices'),
      headers: ['Invoice #', 'Customer', 'Start', 'End', 'Job', 'Operator', 'Well', 'Description', 'Day rate', 'GST rate', 'Date paid', 'Deposit', 'Notes'],
      rows: [...d.invoices]
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
        .map((i) => [i.number, d.customers.find((c) => c.id === i.customerId)?.name ?? '', i.start, i.end, i.jobId, i.operator, i.well, i.description, i.dayRate, i.gstRate, i.datePaid, i.deposit, i.notes])
    }
  ];
  const n = new Date();
  const stamp = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  const safe = (d.business || 'LAUNCH-PAGE').replace(/[^A-Za-z0-9!_-]+/g, '-').replace(/^-|-$/g, '') || 'LAUNCH-PAGE';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(buildXlsx(tabs, d.colors));
  a.download = `${safe}-RECORDS-${stamp}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return tabs.map((t) => ({ name: t.name, rows: t.rows.length }));
}
