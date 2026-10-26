import { useMemo, type ReactNode } from 'react';
import { daysIn, monthKey, paidIn, type Expense } from '../lib/expenses';
import { describeRepeat } from '../lib/repeat';
import { repeatOf, repeatsOn, type Task } from '../lib/tasks';
import type { Project } from '../lib/projects';
import { MonthNav, dayLabel, monthLabel } from './Expenses';

type Row = { task: Task; dates: string[] };

/** The tasks that land in a month: repeats on their days, one-offs due that month. */
export function tasksInMonth(tasks: Task[], month: string): Row[] {
  const out: Row[] = [];
  for (const t of tasks) {
    if (t.deletedAt || t.parentId || (t.done && t.cleared)) continue;
    const dates = repeatOf(t).kind !== 'none' ? daysIn(month, (d) => repeatsOn(t, d)) : t.endDate && monthKey(t.endDate) === month ? [t.endDate] : [];
    if (dates.length) out.push({ task: t, dates });
  }
  return out.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.task.sort - b.task.sort);
}

/**
 * Tasks · Month (LP-030 step 6): only what lands in this month. A task linked to a budget line
 * shows Paid once that month has its expense.
 */
export function TasksMonth(p: {
  month: string;
  onMonth: (m: string) => void;
  tasks: Task[];
  projects: Project[];
  expenses: Expense[];
  search: (t: Task) => boolean;
  onOpen: (t: Task) => void;
  /** Done ✓ and ⋯, the same as List view. */
  actions: (t: Task) => ReactNode;
}) {
  const rows = useMemo(() => tasksInMonth(p.tasks, p.month).filter((r) => p.search(r.task)), [p.tasks, p.month, p.search]);
  const statusOf = (t: Task) => {
    if (t.budgetLineId) return paidIn(p.expenses, t.budgetLineId, p.month).length ? 'PAID' : 'DUE';
    if (repeatOf(t).kind === 'none') return t.done ? 'DONE' : 'DUE';
    return '';
  };
  const paid = rows.filter((r) => statusOf(r.task) === 'PAID').length;
  const bills = rows.filter((r) => r.task.budgetLineId).length;
  return (
    <div className="budget-month tasks-month">
      <div className="expenses-bar">
        <MonthNav month={p.month} onChange={p.onMonth} />
        <span className="tasks-month-count">
          {rows.length} in {monthLabel(p.month)}
          {bills > 0 && ` · bills paid ${paid} of ${bills}`}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="panel-empty">Nothing lands in {monthLabel(p.month)}.</p>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-month-table">
            <thead>
              <tr>
                <th className="col-date">Date</th>
                <th className="col-task">Task</th>
                <th className="col-project">Project</th>
                <th>Repeats</th>
                <th className="col-center">Status</th>
                <th className="col-actions" aria-label="Done" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ task: t, dates }, i) => {
                const pr = p.projects.find((x) => x.id === t.projectId);
                const st = statusOf(t);
                const rep = repeatOf(t);
                return (
                  <tr key={t.id} className={`task-row${i % 2 ? ' is-alt' : ''}${st === 'PAID' || st === 'DONE' ? ' is-paid' : ''}`}>
                    <td className="col-date">{dates.length > 3 ? `${dayLabel(dates[0])} · ×${dates.length}` : dates.map(dayLabel).join(', ')}</td>
                    <td className="col-task">
                      <button type="button" className="task-name" onClick={() => p.onOpen(t)}>
                        {t.task}
                        {t.budgetLineId && <span className="expense-link" aria-label="linked to a budget line"> $$$</span>}
                      </button>
                    </td>
                    <td className="col-project">{pr ? <span className="chip" style={{ ['--chip' as string]: pr.color }}>{pr.name.replace(/^STARDVST\s+/i, '')}</span> : <span className="chip chip-empty">—</span>}</td>
                    <td>{rep.kind === 'none' ? 'Once' : describeRepeat(rep)}</td>
                    <td className="col-center">{st && <span className={`status${st === 'PAID' || st === 'DONE' ? ' status-three' : ''}`}>{st}</span>}</td>
                    <td className="col-actions">{p.actions(t)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
