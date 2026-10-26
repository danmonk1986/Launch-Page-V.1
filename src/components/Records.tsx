import { useState, type ComponentProps } from 'react';
import { Icon, SearchToggle } from './Tasks';
import { ExpensesView, thisMonth } from './Expenses';
import { InvoicesPage } from './Invoices';
import type { BudgetLine } from '../lib/budget';
import type { Expense } from '../lib/expenses';

const CLOSE = 'M6 6l12 12M18 6L6 18';
type View = 'expenses' | 'invoices';
const VIEW_KEY = 'launchpage.records.view';

/**
 * Records (Oct 26): the books. Expenses (what was actually paid) and Invoices (STARDVST billing)
 * for now; V.2 bookkeeping (bank CSVs, draws, year end) lives here too.
 */
export function RecordsPage(
  p: ComponentProps<typeof InvoicesPage> & {
    expenses: Expense[];
    lines: BudgetLine[];
    onSaveExpense: (e: Expense) => Promise<void>;
    onDeleteExpense: (id: string) => Promise<void>;
  }
) {
  const [view, setViewState] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'invoices' ? 'invoices' : 'expenses';
    } catch {
      return 'expenses';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [month, setMonth] = useState(thisMonth);
  const [q, setQ] = useState('');

  const views = (
    <div className="d26-range budget-views" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'expenses'} title="What was actually paid" onClick={() => setView('expenses')}>
        Expenses
      </button>
      <button type="button" aria-pressed={view === 'invoices'} title="STARDVST invoices" onClick={() => setView('invoices')}>
        Invoices
      </button>
    </div>
  );

  if (view === 'invoices') return <InvoicesPage {...p} title="Records" views={views} />;

  return (
    <section className="panel panel-budget panel-records" aria-labelledby="h-records">
      <div className="panel-head">
        <h2 id="h-records" className="panel-title">
          Records
        </h2>
        {views}
        <div className="panel-actions">
          <SearchToggle value={q} onChange={setQ} placeholder="Search expenses" />
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>
      <ExpensesView month={month} onMonth={setMonth} expenses={p.expenses} lines={p.lines} search={q} onSave={p.onSaveExpense} onDelete={p.onDeleteExpense} />
    </section>
  );
}
