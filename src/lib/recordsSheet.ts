/**
 * V20-198 (Dan, Nov 14): ⚙ › Data Management › Export records: the bookkeeping side the Launch Sheet leaves out
 * (Expenses, Income, Draws, Invoices), one .xlsx with a tab each, in the same style as the Launch Sheet.
 * V20-463 (Dan, Nov 22): INCOME added (money in, "it should be there"): the deposits and interest from the bank
 * imports, the same rows and GST as Records › Income, in the Launch Sheet's INCOME columns so Books reads it.
 * No FP column: Books skips sorted-tab rows that carry an FP (copies of LINES), and this file has no LINES.
 */
import { buildXlsx, type SheetSpec } from './xlsx';
import type { Expense } from './expenses';
import { gstCollected, tidy, type BankAccount, type BankLine, type Draw } from './bank';
import { invoiceTotals, type Customer, type Invoice } from './invoices';

export function downloadRecords(d: { business: string; expenses: Expense[]; draws: Draw[]; invoices: Invoice[]; customers: Customer[]; lines?: BankLine[]; accounts?: BankAccount[]; colors: { purple: string; teal: string } }) {
  const top = (title: string) => [{ text: `${d.business.replace(/-/g, ' ')} · ${title}`, style: 'title' as const }];
  const byDate = <T extends { date?: string | null }>(a: T, b: T) => (a.date ?? '').localeCompare(b.date ?? '');
  const customerOf = (i: Invoice | null) => (i?.customerId ? d.customers.find((c) => c.id === i.customerId)?.name ?? '' : '');
  const acct = (n: string) => d.accounts?.find((a) => a.number === n)?.name || n;
  const moneyIn = (d.lines ?? [])
    .filter((l) => l.route === 'income' || l.route === 'interest')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const inv = l.invoiceId ? d.invoices.find((i) => i.id === l.invoiceId) ?? null : null;
      const amount = l.credit ?? -(l.debit ?? 0);
      const what = l.income?.description || (inv ? `${customerOf(inv) || 'Invoice'} · ${inv.number}` : l.route === 'interest' ? 'Interest' : tidy(l.key));
      const gst = l.income?.gst ?? (l.route === 'income' ? (inv ? invoiceTotals(inv).gst : gstCollected(amount)) : 0);
      return [l.date, acct(l.account), l.income?.project ?? '', what, inv?.number ?? '', amount, gst, l.income?.notes ?? ''];
    });
  const tabs: SheetSpec[] = [
    {
      name: 'EXPENSES',
      top: top('Expenses'),
      headers: ['Date', 'Division', 'Description', 'Method', 'Type', 'Category', 'Payment category', 'Amount (CAD)', 'GST/HST', 'Foreign', 'Currency', 'Notes'],
      rows: [...d.expenses].sort(byDate).map((e) => [e.date, e.project, e.description, e.method, e.type, e.category, e.pmtCategory, e.amount, e.gst, e.foreign ?? null, e.currency ?? '', e.notes]),
      group: { col: 0, kind: 'month' }
    },
    {
      name: 'INCOME',
      top: top('Income'),
      headers: ['Date', 'Account', 'Division', 'From', 'Invoice #', 'Amount', 'GST', 'Notes'],
      rows: moneyIn,
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(buildXlsx(tabs, d.colors));
  a.download = `${d.business}-RECORDS-${stamp}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return tabs.map((t) => ({ name: t.name, rows: t.rows.length }));
}
