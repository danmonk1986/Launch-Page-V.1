import { useMemo } from 'react';
import { money, type BudgetLine, type BudgetSection } from '../lib/budget';
import { describeRepeat } from '../lib/repeat';
import { originalLabel } from '../lib/currency';
import { lineRepeat, monthLines, spentIn, type Expense, type MonthLine } from '../lib/expenses';
import { MonthNav, dayLabel, monthLabel } from './Expenses';

const GROUPS: { id: BudgetSection; title: string }[] = [
  { id: 'fixed', title: 'Monthly fixed' },
  { id: 'variable', title: 'Monthly variable' },
  { id: 'annual', title: 'Annual and quarterly · this month only' },
  { id: 'planned', title: 'Planned · this month' }
];

/** Annual or quarterly lines sit together, whatever group they were filed under. */
const groupOf = (m: MonthLine): BudgetSection => {
  const k = lineRepeat(m.line).kind;
  if (k === 'annual' || k === 'quarterly') return 'annual';
  return m.line.section;
};

/**
 * Budget · Month (LP-030 step 5): only what lands in this month, with what was spent on it from
 * Expenses. Paid comes from ticking the linked task, so there's no PAID button here.
 */
export function BudgetMonth(p: {
  month: string;
  onMonth: (m: string) => void;
  lines: BudgetLine[];
  expenses: Expense[];
  linkedIds: Set<string>;
  search: string;
  onEdit: (l: BudgetLine) => void;
}) {
  const needle = p.search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      monthLines(p.lines, p.expenses, p.month).filter(
        (m) => !needle || [m.line.description, m.line.project, m.line.category, m.line.pmtCategory, m.line.notes].some((v) => v.toLowerCase().includes(needle))
      ),
    [p.lines, p.expenses, p.month, needle]
  );
  const due = rows.reduce((a, m) => a + m.due, 0);
  const spentOnLines = rows.reduce((a, m) => a + m.spent, 0);
  const spentAll = spentIn(p.expenses, p.month);
  // Still to pay: bills not yet covered by what was paid against them (variable lines are an allotment).
  const left = rows.filter((m) => m.line.section !== 'variable').reduce((a, m) => a + Math.max(0, m.due - m.spent), 0);

  return (
    <div className="budget-month">
      <div className="expenses-bar">
        <MonthNav month={p.month} onChange={p.onMonth} />
      </div>
      <div className="budget-stats" aria-label={`${monthLabel(p.month)} totals`}>
        <div className="budget-stat budget-stat-total">
          <span className="budget-stat-label">Due · {monthLabel(p.month)}</span>
          <span className="budget-stat-value">{money(due)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Spent</span>
          <span className="budget-stat-value budget-stat-good">{money(spentAll)}</span>
        </div>
        <div className="budget-stat">
          <span className="budget-stat-label">Bills still to pay</span>
          <span className="budget-stat-value">{money(left)}</span>
        </div>
        {spentAll !== spentOnLines && (
          <div className="budget-stat" title="Expenses this month not tied to a budget line">
            <span className="budget-stat-label">Not in the budget</span>
            <span className="budget-stat-value">{money(spentAll - spentOnLines)}</span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="panel-empty">Nothing lands in {monthLabel(p.month)}.</p>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table budget-month-table">
            <thead>
              <tr>
                <th className="col-date">Date</th>
                <th className="col-task">Item</th>
                <th>Repeats</th>
                <th className="col-amount">Planned</th>
                <th className="col-amount">Spent</th>
                <th className="col-amount">Difference</th>
              </tr>
            </thead>
            {GROUPS.map((g) => {
              const list = rows.filter((m) => groupOf(m) === g.id);
              if (!list.length) return null;
              return (
                <tbody key={g.id}>
                  <tr className="task-section">
                    <th colSpan={3} scope="rowgroup">
                      <span className="section-btn">
                        {g.title} <span className="section-count">{list.length}</span>
                      </span>
                    </th>
                    <th className="col-amount budget-subtotal">{money(list.reduce((a, m) => a + m.due, 0))}</th>
                    <th className="col-amount budget-subtotal">{money(list.reduce((a, m) => a + m.spent, 0))}</th>
                    <th />
                  </tr>
                  {list.map((m, i) => {
                    const diff = m.due - m.spent;
                    const rep = lineRepeat(m.line);
                    const paid = m.line.section !== 'variable' && m.due > 0 && m.spent >= m.due;
                    return (
                      <tr key={m.line.id} className={`task-row${i % 2 ? ' is-alt' : ''}${paid ? ' is-paid' : ''}`}>
                        <td className="col-date">{m.dates.length ? m.dates.map(dayLabel).join(', ') : '—'}</td>
                        <td className="col-task">
                          <button type="button" className="task-name" onClick={() => p.onEdit(m.line)}>
                            {m.line.description}
                            {p.linkedIds.has(m.line.id) && <span className="expense-link" aria-label="linked to a task"> 🔗</span>}
                          </button>
                        </td>
                        <td>{rep.kind === 'none' ? (m.line.section === 'variable' || m.line.section === 'fixed' ? 'Every month' : 'Once') : `${rep.kind === 'monthly' ? 'Monthly' : rep.kind === 'quarterly' ? 'Quarterly' : rep.kind === 'annual' ? 'Annually' : 'Weekly'} · ${describeRepeat(rep)}`}</td>
                        <td className="col-amount">
                          {money(m.due)}
                          {originalLabel(m.line) && <span className="money-orig">{originalLabel(m.line)}</span>}
                        </td>
                        <td className="col-amount">{m.spent ? money(m.spent) : ''}</td>
                        <td className={`col-amount${diff < 0 ? ' budget-over' : ''}`}>{m.spent ? (diff < 0 ? `−${money(-diff)}` : money(diff)) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
