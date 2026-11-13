import { useEffect, useState, type ComponentProps } from 'react';
import { Icon, SearchToggle } from './Tasks';
import { ExpensesView, MonthNav, thisMonth } from './Expenses';
import { InvoicesPage } from './Invoices';
import type { BudgetLine } from '../lib/budget';
import type { Expense } from '../lib/expenses';
import type { Project } from '../lib/projects';
import type { BankAccount, BankLine, CommonExpense, Draw } from '../lib/bank';
import { BankImport, type ImportResult } from './BankImport';
import { DrawsView, FyNav, thisFy } from './Draws';
import { IncomeView } from './Income';

const CLOSE = 'M6 6l12 12M18 6L6 18';
const IMPORT = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const PLUS = 'M12 5v14M5 12h14';
type View = 'expenses' | 'income' | 'draws' | 'invoices';
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
    onSaveBankLine: (l: BankLine) => Promise<void>;
    projects: Project[];
    /** V20-161 (Dan, Nov 13): Settings › Modules. Invoice = the Invoices view; Records = Expenses, Income and Draws. */
    showInvoices?: boolean;
    showBooks?: boolean;
  }
) {
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'invoices' || v === 'draws' || v === 'income' ? v : 'expenses';
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

  // Nov 1: the views are pills under the header (Income joins them soon), like Tasks' filters.
  const VIEWS: { id: View; label: string; hint: string }[] = [
    { id: 'expenses', label: 'Expenses', hint: 'What was actually paid' },
    { id: 'income', label: 'Income', hint: 'Money in: client payments and interest, and the year by month' },
    { id: 'draws', label: 'Draws', hint: 'Business withdrawals and e-transfers to you' },
    { id: 'invoices', label: 'Invoices', hint: 'STARDVST invoices' }
  ];
  const shownViews = VIEWS.filter((v) => (v.id === 'invoices' ? p.showInvoices !== false : p.showBooks !== false));
  const firstShown = shownViews.some((v) => v.id === view) ? null : shownViews[0]?.id ?? null;
  useEffect(() => {
    if (firstShown) setView(firstShown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstShown]);
  const views = (
    <div className="area-filter pill-row records-views" role="group" aria-label="Records">
      {shownViews.map((v) => (
        <button key={v.id} type="button" className="area-pill" aria-pressed={view === v.id} title={v.hint} onClick={() => setView(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  );

  if (view === 'invoices' && p.showInvoices !== false) return <InvoicesPage {...p} title="Records" below={views} />;

  return (
    <section className="panel panel-budget panel-records" aria-labelledby="h-records">
      <div className="panel-head">
        <h2 id="h-records" className="panel-title">
          Records
        </h2>
        {view === 'draws' || view === 'income' ? <FyNav fy={fy} fyEnd={fyEnd} onChange={setFy} /> : <MonthNav month={month} onChange={setMonth} />}
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Import CSV" title="Import bank statements (CSV) into Expenses and Draws" onClick={() => setImporting(true)}>
            <Icon d={IMPORT} />
          </button>
          {view === 'expenses' && (
            <button type="button" className="icon-btn tool-btn" aria-label="Add expense" title="Add an expense" onClick={() => setAddTick((n) => n + 1)}>
              <Icon d={PLUS} />
            </button>
          )}
          <SearchToggle value={q} onChange={setQ} placeholder={view === 'draws' ? 'Search draws' : view === 'income' ? 'Search income' : 'Search expenses'} />
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>
      {views}
      {view === 'income' ? (
        <IncomeView
          lines={p.bankLines}
          accounts={p.bankAccounts}
          invoices={p.invoices}
          customers={p.customers}
          expenses={p.expenses}
          draws={p.draws}
          fy={fy}
          fyEnd={fyEnd}
          personal={p.profile?.personalDivision || (p.profile?.person ?? '').toUpperCase().replace(/\s+/g, '') || 'PERSONAL'}
          search={q}
          onSaveLine={p.onSaveBankLine}
          onSaveInvoice={p.onSave}
        />
      ) : view === 'draws' ? (
        <DrawsView draws={p.draws} fy={fy} fyEnd={fyEnd} search={q} onSave={p.onSaveDraw} onDelete={p.onDeleteDraw} />
      ) : (
        <ExpensesView month={month} onMonth={setMonth} expenses={p.expenses} lines={p.lines} search={q} onSave={p.onSaveExpense} onDelete={p.onDeleteExpense} addTick={addTick} projects={p.projects} />
      )}
      <BankImport
        open={importing}
        onClose={() => setImporting(false)}
        accounts={p.bankAccounts}
        common={p.common}
        imported={p.bankLines}
        expenses={p.expenses}
        draws={p.draws}
        budget={p.lines}
        invoices={p.invoices}
        profile={p.profile}
        onSave={p.onImport}
      />
    </section>
  );
}
