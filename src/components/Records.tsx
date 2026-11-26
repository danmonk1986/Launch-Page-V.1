import { useHeaderSearch } from '../lib/headerSearch';
import { useBooks, useBooksTools } from '../lib/beta';
import { useEffect, useState, type ComponentProps } from 'react';
import { Icon } from './Tasks';
import { ExpensesView, MonthNav, thisMonth } from './Expenses';
import { InvoicesPage } from './Invoices';
import type { BudgetLine } from '../lib/budget';
import type { Expense } from '../lib/expenses';
import type { Project } from '../lib/projects';
import type { BankAccount, BankLine, CommonExpense, Draw } from '../lib/bank';
import { fyOf } from '../lib/bank';
import { StatementCheck } from './StatementCheck';
import { useBooksUndo } from '../lib/booksUndo';
import { BankImport, type ImportResult } from './BankImport';
import { DrawsView, FyNav, thisFy } from './Draws';
import { IncomeView } from './Income';
import { FoldTabs } from './FoldTabs';

const IMPORT = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const PLUS = 'M12 5v14M5 12h14';
// V20-505: the Audit (a ticked box), the same on Expenses and Budget.
const AUDIT = 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11';
type View = 'expenses' | 'income' | 'draws' | 'invoices';
const CLOSE = 'M6 6l12 12M18 6L6 18';
const UNDO = 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11';
const VIEW_KEY = 'launchpage.records.view';
/** V20-453: the Books home's cards open Records on their own view (Expenses or Income). */
// V20-464b (Dan, Nov 22): …and on the month the Books overview is showing (Income: that month's fiscal year).
// Read once when the page opens; from there the page's own ‹ › moves it on its own.
let presetMonth: string | null = null;
export const presetRecordsView = (v: 'expenses' | 'income' | 'draws', month?: string) => {
  presetMonth = month ?? null;
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* ignore */
  }
};
const takePresetMonth = () => {
  const m = presetMonth;
  presetMonth = null;
  return m;
};

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
    /** V20-310: each bookkeeping view on its own (Settings › Modules › Records). */
    showViews?: { expenses: boolean; income: boolean; draws: boolean };
    /** V20-474 (Books): the Cash Book's opening balance, set from "Set up your books". */
    cashBook?: { start: string; opening: number };
    onSetOpening?: (start: string, opening: number) => void;
    /** V20-507 (Books setup, track 3): the blank Launch Sheet and importing it back. */
    onDownloadSheet?: () => void;
    onImportSheet?: (f: File) => void;
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
  const [preset] = useState(takePresetMonth);
  const [month, setMonth] = useState(() => preset ?? thisMonth());
  const books = useBooks();
  // V20-532: the Books tools also run in Main; the Books look (title, ^, no tabs) stays on the Books track.
  const tools = useBooksTools();
  // V20-245: the header search drives this page.
  const { q } = useHeaderSearch();
  const [importing, setImporting] = useState(false);
  // V20-474: "Set up your books" opens the import blank.
  const [setup, setSetup] = useState(false);
  // V20-493: an expense's method opens the statement line it came from.
  const [focus, setFocus] = useState<{ month: string; fp: string } | null>(null);
  // V20-502: the expense picked in "Not on your statement" (scrolled to and lit up in the list).
  const [spot, setSpot] = useState<{ id: string; n: number } | null>(null);
  // V20-505: the Audit (Not on your statement) opens from the header; its count shows on the button.
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditN, setAuditN] = useState(0);
  const undo = useBooksUndo();
  // V20-198: ⚙ › Data Management › Import bank statements opens Records, then this.
  useEffect(() => {
    const open = () => (setSetup(false), setFocus(null), setImporting(true));
    window.addEventListener('records:import', open);
    const openSetup = () => (setSetup(true), setFocus(null), setImporting(true));
    window.addEventListener('records:setup', openSetup);
    // V20-453: the Expenses card's + opens Records, then Add expense.
    const add = () => setAddTick((n) => n + 1);
    window.addEventListener('records:add', add);
    return () => {
      window.removeEventListener('records:import', open);
      window.removeEventListener('records:setup', openSetup);
      window.removeEventListener('records:add', add);
    };
  }, []);
  const fyEnd = p.profile?.fyEnd ?? '09-30';
  const [fy, setFy] = useState(() => (preset ? fyOf(`${preset}-01`, fyEnd) : thisFy(fyEnd)));
  const [addTick, setAddTick] = useState(0);

  // Nov 1: the views are pills under the header (Income joins them soon), like Tasks' filters.
  const VIEWS: { id: View; label: string; hint: string }[] = [
    { id: 'expenses', label: 'Expenses', hint: 'What was actually paid' },
    { id: 'income', label: 'Income', hint: 'Money in: client payments and interest, and the year by month' },
    { id: 'draws', label: 'Draws', hint: 'Business withdrawals and e-transfers to you' },
    { id: 'invoices', label: 'Invoices', hint: 'STARDVST invoices' }
  ];
  const shownViews = VIEWS.filter((v) => (v.id === 'invoices' ? p.showInvoices !== false : p.showBooks !== false && (!p.showViews || p.showViews[v.id as 'expenses' | 'income' | 'draws'] !== false)));
  const firstShown = shownViews.some((v) => v.id === view) ? null : shownViews[0]?.id ?? null;
  useEffect(() => {
    if (firstShown) setView(firstShown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstShown]);
  // V20-191 (Dan, Nov 14): the views are tabs, the same as Tasks and Timed launches (were pills).
  const views = <FoldTabs label="Records" items={shownViews.map((v) => ({ id: v.id, label: v.label }))} value={view} onPick={setView} />;

  if (view === 'invoices' && p.showInvoices !== false) return <InvoicesPage {...p} title="Records" below={views} />;

  return (
    <section className="panel panel-budget panel-records" aria-labelledby="h-records">
      <div className="panel-head">
        {/* V20-455b/d (Dan, Nov 22): on the Books track (a test harness) the page is titled by its card (EXPENSES or
            INCOME) and its ^ goes back to BOOKS.
            Main keeps its × (the harness doesn't change the real Records page). */}
        {books ? (
          <div className="rockets-title">
            <h2 id="h-records" className="panel-title">
              {view === 'income' ? 'Income' : view === 'draws' ? 'Draws' : 'Expenses'}
            </h2>
            <button type="button" className="rockets-toggle is-open" aria-label="Back to BOOKS" title="Back to BOOKS" onClick={p.onClose}>
              <Icon d="M6 9l6 6 6-6" />
            </button>
          </div>
        ) : (
          <h2 id="h-records" className="panel-title">
            Records
          </h2>
        )}
        {view === 'draws' || view === 'income' ? <FyNav fy={fy} fyEnd={fyEnd} onChange={setFy} /> : <MonthNav month={month} onChange={setMonth} />}
        <div className="panel-actions">
          {/* V20-195 (Dan, Nov 14): search always first (outermost), like Tasks and Budget. */}
          <button type="button" className="icon-btn tool-btn" aria-label="Import CSV" title="Import bank statements (CSV) into Expenses and Draws" onClick={() => setImporting(true)}>
            <Icon d={IMPORT} />
          </button>
          {/* V20-506: Undo the last change on the books (also Cmd / Ctrl + Z). */}
          {tools && (
            <button type="button" className="icon-btn tool-btn" aria-label={undo.count ? `Undo: ${undo.label}` : 'Nothing to undo'} title={undo.count ? `Undo: ${undo.label} (Cmd/Ctrl + Z)` : 'Nothing to undo yet'} disabled={!undo.count} onClick={undo.undo}>
              <Icon d={UNDO} />
            </button>
          )}
          {tools && view === 'expenses' && (
            <button type="button" className={`icon-btn tool-btn audit-btn${auditOpen ? ' is-on' : ''}`} aria-label={`Audit${auditN ? `: ${auditN} to check` : ''}`} aria-pressed={auditOpen} title="Audit: spreadsheet lines your bank statement doesn't back up" onClick={() => setAuditOpen((o) => !o)}>
              <Icon d={AUDIT} />
              {auditN > 0 && <span className="audit-count">{auditN}</span>}
            </button>
          )}
          {view === 'expenses' && (
            <button type="button" className="icon-btn tool-btn" aria-label="Add expense" title="Add an expense" onClick={() => setAddTick((n) => n + 1)}>
              <Icon d={PLUS} />
            </button>
          )}
          {!books && (
            <button type="button" className="icon-btn tool-btn" aria-label="Back to L4UNCH P4GE" title="Back to L4UNCH P4GE" onClick={p.onClose}>
              <Icon d={CLOSE} />
            </button>
          )}
        </div>
      </div>
      {/* V20-455d (Dan, Nov 22): on Books each card opens its own page (Expenses or Income), so no view tabs. */}
      {!books && views}
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
        <>
        {tools && <StatementCheck lines={p.bankLines} expenses={p.expenses} accounts={p.bankAccounts} onImport={p.onImport} open={auditOpen} onClose={() => setAuditOpen(false)} onCount={setAuditN} onShow={(id, date) => (setMonth(date.slice(0, 7)), setSpot((s) => ({ id, n: (s?.n ?? 0) + 1 })))} />}
        <ExpensesView month={month} onMonth={setMonth} expenses={p.expenses} lines={p.lines} search={q} onSave={p.onSaveExpense} onDelete={p.onDeleteExpense} addTick={addTick} projects={p.projects} spot={spot}
          sourceOf={
            tools
              ? (e) => p.bankLines.find((l) => l.expenseId === e.id || (l.parts ?? []).some((x) => x.expenseId === e.id)) ?? null
              : undefined
          }
          onOpenSource={(l) => (setSetup(false), setFocus({ month: l.date.slice(0, 7), fp: l.fp }), setImporting(true))}
        />
        </>
      )}
      <BankImport
        open={importing}
        onClose={() => setImporting(false)}
        onDone={books ? p.onClose : undefined}
        accounts={p.bankAccounts}
        common={p.common}
        imported={p.bankLines}
        expenses={p.expenses}
        draws={p.draws}
        budget={p.lines}
        invoices={p.invoices}
        profile={p.profile}
        onSave={p.onImport}
        setup={setup}
        focus={focus}
        cashBook={p.cashBook}
        onSetOpening={p.onSetOpening}
        onDownloadSheet={p.onDownloadSheet}
        onImportSheet={p.onImportSheet}
      />
    </section>
  );
}
