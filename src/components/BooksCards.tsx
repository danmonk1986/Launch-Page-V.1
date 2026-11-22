import { Icon } from './Tasks';
import { money } from '../lib/budget';
import type { Expense } from '../lib/expenses';
import { tidy, type BankLine } from '../lib/bank';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';

/**
 * V20-453 (Dan, Nov 22): the Books home (beta Books track). Two cards beside the Budget card, laid out like it:
 * this month's total, then the latest few. ⌄ opens the full page (Records › Expenses / Income); + adds or imports.
 */
const CHEV = 'M6 9l6 6 6-6';
const PLUS = 'M12 5v14M5 12h14';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });
const SHOW = 6;

function CardHead({ id, title, openLabel, onOpen, addLabel, onAdd }: { id: string; title: string; openLabel: string; onOpen: () => void; addLabel?: string; onAdd?: () => void }) {
  return (
    <div className="panel-head">
      <div className="rockets-title">
        <h2 id={id} className="panel-title">
          {title}
        </h2>
        <button type="button" className="rockets-toggle" aria-label={openLabel} title={openLabel} onClick={onOpen}>
          <Icon d={CHEV} />
        </button>
      </div>
      {onAdd && (
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label={addLabel} title={addLabel} onClick={onAdd}>
            <Icon d={PLUS} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ExpensesCard({ expenses, today, onOpenAll, onAdd }: { expenses: Expense[]; today: Date; onOpenAll: () => void; onAdd?: () => void }) {
  const { q } = useHeaderSearch();
  const m = iso(today);
  const month = expenses.filter((e) => e.date.slice(0, 7) === m);
  const total = month.reduce((a, e) => a + (e.amount ?? 0), 0);
  const latest = [...expenses]
    .filter((e) => matchesSearch(q, e.description, e.category, e.project, e.notes))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sort - a.sort))
    .slice(0, SHOW);
  return (
    <section className="panel panel-budget-card panel-books-card" aria-labelledby="h-expenses-card">
      <CardHead id="h-expenses-card" title="Expenses" openLabel="Open all Expenses" onOpen={onOpenAll} addLabel="Add an expense" onAdd={onAdd} />
      <div className="budget-stats" aria-label="This month">
        <div className="budget-stat budget-stat-total" aria-pressed="true">
          <span className="budget-stat-label">{monthName(today)} · spent</span>
          <span className="budget-stat-value">{money(total)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Entries</span>
          <span className="budget-stat-value">{month.length}</span>
        </div>
      </div>
      <h3 className="card-h">Latest</h3>
      {latest.length === 0 ? (
        <p className="field-hint">No expenses yet. Tap + to add one, or ⌄ to import a bank statement.</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Latest expenses">
          <div className="bc-row bc-head books-row" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">What</span>
            <span role="columnheader">Category</span>
            <span role="columnheader" className="bc-amt">Amount</span>
          </div>
          {latest.map((e, i) => (
            <button type="button" key={e.id} className={`bc-row bc-row-btn books-row${i % 2 ? ' is-alt' : ''}`} role="row" title="Open Expenses" onClick={onOpenAll}>
              <span className="pl-mono pl-due">{day(e.date)}</span>
              <span className="pl-name bc-name">{e.description || '—'}</span>
              <span className="pl-desc">{e.category}</span>
              <span className="pl-mono bc-amt">{e.amount === null ? '—' : money(e.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function IncomeCard({ lines, today, onOpenAll, onImport }: { lines: BankLine[]; today: Date; onOpenAll: () => void; onImport?: () => void }) {
  const { q } = useHeaderSearch();
  const m = iso(today);
  const ins = lines
    .filter((l) => l.route === 'income' || l.route === 'interest')
    .map((l) => ({ l, amount: l.credit ?? -(l.debit ?? 0), what: l.income?.description || (l.route === 'interest' ? 'Interest' : tidy(l.key)) }));
  const month = ins.filter((x) => x.l.date.slice(0, 7) === m);
  const total = month.reduce((a, x) => a + x.amount, 0);
  const latest = ins
    .filter((x) => matchesSearch(q, x.what, x.l.text))
    .sort((a, b) => (a.l.date < b.l.date ? 1 : a.l.date > b.l.date ? -1 : 0))
    .slice(0, SHOW);
  return (
    <section className="panel panel-budget-card panel-books-card" aria-labelledby="h-income-card">
      <CardHead id="h-income-card" title="Income" openLabel="Open all Income" onOpen={onOpenAll} addLabel="Import a bank statement" onAdd={onImport} />
      <div className="budget-stats" aria-label="This month">
        <div className="budget-stat budget-stat-total" aria-pressed="true">
          <span className="budget-stat-label">{monthName(today)} · in</span>
          <span className="budget-stat-value">{money(total)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Deposits</span>
          <span className="budget-stat-value">{month.length}</span>
        </div>
      </div>
      <h3 className="card-h">Latest</h3>
      {latest.length === 0 ? (
        <p className="field-hint">No income yet. Money in comes from your bank statements: tap + to import one.</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Latest income">
          <div className="bc-row bc-head books-row" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">From</span>
            <span role="columnheader">Account</span>
            <span role="columnheader" className="bc-amt">Amount</span>
          </div>
          {latest.map((x, i) => (
            <button type="button" key={x.l.id} className={`bc-row bc-row-btn books-row${i % 2 ? ' is-alt' : ''}`} role="row" title="Open Income" onClick={onOpenAll}>
              <span className="pl-mono pl-due">{day(x.l.date)}</span>
              <span className="pl-name bc-name">{x.what}</span>
              <span className="pl-desc">{x.l.account}</span>
              <span className="pl-mono bc-amt">{money(x.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
