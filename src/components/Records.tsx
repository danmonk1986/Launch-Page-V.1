import { useState, type ComponentProps } from 'react';
import { Icon, SearchToggle } from './Tasks';
import { ExpensesView, MonthNav, thisMonth } from './Expenses';
import { InvoicesPage } from './Invoices';
import type { BudgetLine } from '../lib/budget';
import type { Expense } from '../lib/expenses';
import type { BankAccount, BankLine, CommonExpense, Draw } from '../lib/bank';
import { BankImport, type ImportResult } from './BankImport';
import { DrawsView, FyNav, thisFy } from './Draws';

const CLOSE = 'M6 6l12 12M18 6L6 18';
const IMPORT = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const PLUS = 'M12 5v14M5 12h14';
type View = 'expenses' | 'draws' | 'invoices';
const VIEW_KEY = 'launchpage.records.view';

/**
 * Records (Oct 26): the books. Expenses (what was actually paid) and Invoices (STARDVST billing)
 * and Draws; Import CSV brings bank statements in (V20-015). Year end lives here too, later.
 */
export function RecordsPage(
  p: ComponentProps<typeof InvoicesPage> & {
    expenses: Expense[];
    lines: BudgetLine[];
    onSaveExpense: (e: Expense) => Promise<void>;
    onDeleteExpense: (id: string) => Promise<void>;
    draws: Draw[];
    bankAccounts: BankAccount[];
    bankLines: BankLine[];
    common: CommonExpense[];
    onSaveDraw: (d: Draw) => Promise<void>;
    onDeleteDraw: (id: string) => Promise<void>;
    onImport: (r: ImportResult) => Promise<void>;
  }
) {
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'invoices' || v === 'draws' ? v : 'expenses';
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
  const [importing, setImporting] = useState(false);
  const fyEnd = p.profile?.fyEnd ?? '09-30';
  const [fy, setFy] = useState(() => thisFy(fyEnd));
  const [addTick, setAddTick] = useState(0);

  const views = (
    <div className="d26-range budget-views" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'expenses'} title="What was actually paid" onClick={() => setView('expenses')}>
        Expenses
      </button>
      <button type="button" aria-pressed={view === 'draws'} title="Business withdrawals and e-transfers to you" onClick={() => setView('draws')}>
        Draws
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
        {view === 'draws' ? <FyNav fy={fy} fyEnd={fyEnd} onChange={setFy} /> : <MonthNav month={month} onChange={setMonth} />}
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Import CSV" title="Import bank statements (CSV) into Expenses and Draws" onClick={() => setImporting(true)}>
            <Icon d={IMPORT} />
          </button>
          {view === 'expenses' && (
            <button type="button" className="icon-btn tool-btn" aria-label="Add expense" title="Add an expense" onClick={() => setAddTick((n) => n + 1)}>
              <Icon d={PLUS} />
            </button>
          )}
          <SearchToggle value={q} onChange={setQ} placeholder={view === 'draws' ? 'Search draws' : 'Search expenses'} />
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>
      {view === 'draws' ? (
        <DrawsView draws={p.draws} fy={fy} fyEnd={fyEnd} search={q} onSave={p.onSaveDraw} onDelete={p.onDeleteDraw} />
      ) : (
        <ExpensesView month={month} onMonth={setMonth} expenses={p.expenses} lines={p.lines} search={q} onSave={p.onSaveExpense} onDelete={p.onDeleteExpense} addTick={addTick} />
      )}
      <BankImport
        open={importing}
        onClose={() => setImporting(false)}
        accounts={p.bankAccounts}
        common={p.common}
        imported={p.bankLines}
        expenses={p.expenses}
        draws={p.draws}
        invoices={p.invoices}
        profile={p.profile}
        onSave={p.onImport}
      />
    </section>
  );
}
