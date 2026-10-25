import { useId, useMemo, useRef, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon, SearchToggle, TaskSheet } from './Tasks';
import { TitleCombo } from './Launchers';
import { RepeatPicker } from './RepeatPicker';
import { ExpensesView, thisMonth } from './Expenses';
import { BudgetMonth } from './BudgetMonth';
import { AddItemForm, type AddItemResult } from './AddItem';
import type { Expense } from '../lib/expenses';
import { fromLine, planLinks, type LinkPlan } from '../lib/links';
import { newTask, type Task } from '../lib/tasks';
import { describeRepeat, readRepeat, writeRepeat } from '../lib/repeat';
import type { Project } from '../lib/projects';
import {
  BUDGET_CATEGORIES,
  BUDGET_SECTIONS,
  GROUP_BY,
  groupKey,
  PMT_TYPES,
  download,
  linesFromFile,
  linesToCsv,
  money,
  monthlyByCategory,
  sumLines,
  type BudgetGroupBy,
  type BudgetLine,
  type BudgetSection
} from '../lib/budget';

const PLUS = 'M12 5v14M5 12h14';
const CLOSE = 'M6 6l12 12M18 6L6 18';
// One square button cycles the totals: layers (group), a list (pmt category), a folder (project), four boxes (budget category).
const GROUP_ICON: Record<BudgetGroupBy, string> = {
  section: 'M12 3 2 8l10 5 10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
  pmtCategory: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  category: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
};
const LINK = 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';
const IMPORT = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const EXPORT = 'M12 15V3M7 8l5-5 5 5M5 21h14';

type Props = {
  lines: BudgetLine[];
  projects: Project[];
  onSave: (l: BudgetLine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReplace: (lines: BudgetLine[]) => Promise<void>;
  onClose: () => void;
  /** ⋯ on a line (Oct 20): the same as a task's, with Add a task in place of Add a step. */
  onToCalendar: (l: BudgetLine, projectId: string | null) => void;
  onToLaunch: (l: BudgetLine) => void;
  /** The linked task's form opens here; saving goes through the usual task save. */
  onSaveTask: (t: Task) => Promise<void>;
  onSaveTasks: (t: Task[]) => Promise<void>;
  /** Expenses (LP-030): what was actually paid. */
  expenses: Expense[];
  onSaveExpense: (e: Expense) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
  /** Link and dedupe (LP-030 step 3). */
  tasks: Task[];
  onApplyLinks: (plan: LinkPlan) => Promise<void>;
  onAddItem: (r: AddItemResult) => Promise<void>;
};

type BudgetView = 'master' | 'month' | 'expenses';

/** The ⋯ menu on a budget line. */
function LineMenu({ l, hasTask, onEdit, onCalendar, onLaunch, onTask, onRemove }: { l: BudgetLine; hasTask: boolean; onEdit: () => void; onCalendar: () => void; onLaunch: () => void; onTask: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div
      className="row-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button type="button" className="quick-btn quick-skip task-quick" aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${l.description}`} title="More" onClick={() => setOpen((o) => !o)}>
        <Icon d="M5 12h.01M12 12h.01M19 12h.01" size={18} />
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={run(onEdit)}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={run(onCalendar)}>
            Add to calendar
          </button>
          <button type="button" role="menuitem" onClick={run(onLaunch)}>
            Create launch
          </button>
          <button type="button" role="menuitem" onClick={run(onTask)}>
            {hasTask ? 'Open its task' : 'Add a task'}
          </button>
          <button type="button" role="menuitem" className="menu-danger" onClick={run(onRemove)}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/^stardvst\s+/, '').replace(/[^a-z0-9]/g, '');

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Budget V.1: the Launch Sheet's BUDGET tab, laid out like the task list. */
export function BudgetPage(p: Props) {
  // The box clicked: shows only its lines. null = everything.
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [incoming, setIncoming] = useState<{ name: string; lines: BudgetLine[] } | null>(null);
  const [importError, setImportError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [linkPlan, setLinkPlan] = useState<LinkPlan | null>(null);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding] = useState(false);
  // The linked task whose form is open, and whether it was just made.
  const [taskOpen, setTaskOpen] = useState<{ task: Task; fresh: boolean } | null>(null);
  // Budget | Expenses (LP-030), remembered on this device.
  const [view, setViewState] = useState<BudgetView>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.view');
      return v === 'expenses' || v === 'month' ? v : 'master';
    } catch {
      return 'master';
    }
  });
  // One month for Month and Expenses, so switching keeps your place.
  const [month, setMonth] = useState(thisMonth);
  const setView = (v: BudgetView) => {
    setViewState(v);
    try {
      localStorage.setItem('launchpage.budget.view', v);
    } catch {
      /* ignore */
    }
  };

  const bySection = useMemo(() => {
    const g = {} as Record<BudgetSection, BudgetLine[]>;
    for (const s of BUDGET_SECTIONS) g[s.id] = p.lines.filter((l) => l.section === s.id).sort((a, b) => a.sort - b.sort);
    return g;
  }, [p.lines]);
  const [groupBy, setGroupByState] = useState<BudgetGroupBy>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.groupBy');
      return GROUP_BY.some((g) => g.id === v) ? (v as BudgetGroupBy) : 'section';
    } catch {
      return 'section';
    }
  });
  const setGroupBy = (g: BudgetGroupBy) => {
    setGroupByState(g);
    setPick(null);
    try {
      localStorage.setItem('launchpage.budget.groupBy', g);
    } catch {
      /* ignore */
    }
  };
  const gi = GROUP_BY.findIndex((g) => g.id === groupBy);
  const groupLabel = GROUP_BY[gi].label.toLowerCase();
  const nextGroup = GROUP_BY[(gi + 1) % GROUP_BY.length].id;
  const nextLabel = GROUP_BY[(gi + 1) % GROUP_BY.length].label.toLowerCase();
  const perCat = monthlyByCategory(p.lines, groupBy);
  const monthly = Object.values(perCat).reduce((a, x) => a + x, 0);
  // Budget categories keep the sheet's column order; the others go biggest first.
  const cats =
    groupBy === 'section'
      ? BUDGET_SECTIONS.map((x) => x.id as string).filter((id) => bySection[id as BudgetSection].length)
      : groupBy === 'category'
      ? [...BUDGET_CATEGORIES.filter((c) => perCat[c]), ...Object.keys(perCat).filter((c) => !BUDGET_CATEGORIES.includes(c) && perCat[c])]
      : Object.keys(perCat)
          .filter((c) => perCat[c])
          .sort((a, b) => perCat[b] - perCat[a]);

  // The sheet's project name as one of your Projects (exact first, then "DAN MONK" ≈ "DANMONK26"), like Tasks shows them.
  const projectFor = (name: string) => {
    const n = norm(name);
    if (!n) return undefined;
    return p.projects.find((x) => norm(x.name) === n) ?? p.projects.find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
  };
  /** ⋯ → Add a task: a linked task from the line, then its form. A linked line opens its task. */
  async function openTaskFor(l: BudgetLine) {
    const have = p.tasks.find((t) => t.budgetLineId === l.id && !t.deletedAt);
    if (have) return setTaskOpen({ task: have, fresh: false });
    const base = newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), projectFor(l.project)?.id ?? null);
    const t = fromLine({ ...base, status: 'PENDING', description: l.category || l.pmtCategory || '', notes: l.notes }, l);
    await p.onSaveTask(t);
    setTaskOpen({ task: t, fresh: true });
  }
  const linkedIds = new Set(p.tasks.filter((t) => t.budgetLineId && !t.deletedAt).map((t) => t.budgetLineId!));
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const readFile = async (f: File) => {
    setImportError('');
    try {
      const lines = linesFromFile(f.name, await f.text());
      if (!lines.length) throw new Error('No budget lines found in that file.');
      setIncoming({ name: f.name, lines });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That file could not be read.');
      setIncoming({ name: f.name, lines: [] });
    }
  };

  // Search (Oct 22): a line matches on any of its words or its amount.
  const needle = q.trim().toLowerCase();
  const found = (l: BudgetLine) =>
    !needle || [l.description, l.project, l.method, l.type, l.category, l.pmtCategory, l.notes, l.amount === null ? '' : String(l.amount)].some((v) => v.toLowerCase().includes(needle));
  const shows = (l: BudgetLine) => (pick === null || groupKey(l, groupBy) === pick) && found(l);
  const sections = BUDGET_SECTIONS.map((s) => s.id).filter((id) => (pick === null && !needle) || bySection[id].some(shows));
  const boxLabel = (c: string) => {
    if (groupBy !== 'section') return c;
    const t = BUDGET_SECTIONS.find((x) => x.id === c)?.title ?? c;
    return c === 'annual' ? `${t} ÷ 12` : c === 'planned' ? `${t} · not in monthly` : t;
  };
  const boxValue = (c: string) => (groupBy === 'section' && c === 'planned' ? sumLines(bySection.planned) : perCat[c] ?? 0);

  return (
    <section className="panel panel-tasks-page panel-budget" aria-labelledby="h-budget">
      <div className="panel-head">
        <h2 id="h-budget" className="panel-title">
          Budget
        </h2>
        <div className="d26-range budget-views" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'master'} title="Every line and its repeat" onClick={() => setView('master')}>
            Master
          </button>
          <button type="button" aria-pressed={view === 'month'} title="Only what lands this month" onClick={() => setView('month')}>
            Month
          </button>
          <button type="button" aria-pressed={view === 'expenses'} onClick={() => setView('expenses')}>
            Expenses
          </button>
        </div>
        <div className="panel-actions">
          <SearchToggle value={q} onChange={setQ} placeholder={view === 'expenses' ? 'Search expenses' : 'Search the budget'} />
          {view !== 'expenses' && (
            <button type="button" className="icon-btn tool-btn" aria-label="Add item" title="Add item: a budget line, a task, or both linked" onClick={() => setAdding(true)}>
            <Icon d={PLUS} />
          </button>
          )}
          {view === 'master' && (
          <>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Link to tasks"
            title="Link budget lines to their tasks, clear duplicate tasks, add tasks for bills"
            disabled={!p.lines.length}
            onClick={() => setLinkPlan(planLinks(p.lines, p.tasks, { now: new Date().toISOString(), projectFor: (n) => projectFor(n)?.id ?? null }))}
          >
            <Icon d={LINK} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Import" title="Import the BUDGET tab (CSV) or a JSON file" onClick={() => file.current?.click()}>
            <Icon d={IMPORT} />
          </button>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Export CSV"
            title="Export as CSV (opens in Google Sheets; imports back in here)"
            disabled={!p.lines.length}
            onClick={() => download(`launchpage-budget-${new Date().toISOString().slice(0, 10)}.csv`, linesToCsv(p.lines), 'text/csv')}
          >
            <Icon d={EXPORT} />
          </button>
          </>
          )}
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
          <input
            ref={file}
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readFile(f);
            }}
          />
        </div>
      </div>

      {view === 'month' && <BudgetMonth month={month} onMonth={setMonth} lines={p.lines} expenses={p.expenses} linkedIds={linkedIds} search={q} onEdit={setEditing} />}
      {view === 'expenses' && <ExpensesView month={month} onMonth={setMonth} expenses={p.expenses} lines={p.lines} search={q} onSave={p.onSaveExpense} onDelete={p.onDeleteExpense} />}

      {view === 'master' && p.lines.length > 0 && (
        <div className="budget-stats" aria-label="A month of spending">
          <button
            type="button"
            className="icon-btn tool-btn budget-groupby"
            aria-label={`Monthly totals by ${groupLabel}. Switch to ${nextLabel}`}
            title={`By ${groupLabel} · tap for ${nextLabel}`}
            onClick={() => setGroupBy(nextGroup)}
          >
            <Icon d={GROUP_ICON[groupBy]} size={18} />
          </button>
          <button type="button" className="budget-stat budget-stat-total" aria-pressed={pick === null} title="Everything · fixed + variable + annual ÷ 12" onClick={() => setPick(null)}>
            <span className="budget-stat-label">Monthly · by {groupLabel}</span>
            <span className="budget-stat-value">{money(monthly)}</span>
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className="budget-stat" aria-pressed={pick === c} title={pick === c ? 'Show everything' : `Show only ${boxLabel(c)}`} onClick={() => setPick(pick === c ? null : c)}>
              <span className="budget-stat-label">{boxLabel(c)}</span>
              <span className="budget-stat-value">{money(boxValue(c))}</span>
            </button>
          ))}
        </div>
      )}

      {view !== 'master' ? null : p.lines.length === 0 ? (
        <div className="budget-empty">
          <p className="panel-empty">
            No budget yet. In the Launch Sheet, open the <strong>BUDGET</strong> tab, then <strong>File → Download → Comma-separated values (.csv)</strong>, and import that file here.
          </p>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Import the BUDGET tab
          </button>
        </div>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table">
            <thead>
              <tr>
                <th className="col-project">Project</th>
                <th className="col-date">Date</th>
                <th className="col-task">Description</th>
                <th className="col-center">Method</th>
                <th className="col-center">Type</th>
                <th className="col-center">Category</th>
                <th>Pmt category</th>
                <th className="col-amount">Amount</th>
                <th className="col-notes">Notes</th>
                <th className="col-actions" aria-label="More" />
              </tr>
            </thead>
            {sections.map((id) => {
              const s = BUDGET_SECTIONS.find((x) => x.id === id)!;
              const rows = bySection[id].filter(shows);
              const shut = !needle && !(groupBy === 'section' && pick) && closed[id];
              return (
                <tbody key={id}>
                  <tr className="task-section">
                    <th colSpan={7} scope="rowgroup">
                      <button type="button" className="section-btn" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [id]: !c[id] }))}>
                        <span className="section-caret" aria-hidden="true">
                          {shut ? '›' : '⌄'}
                        </span>
                        {s.title} <span className="section-count">{rows.length}</span>
                      </button>
                    </th>
                    <th className="col-amount budget-subtotal">{money(sumLines(rows))}</th>
                    <th />
                    <th />
                  </tr>
                  {!shut && rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="task-empty">
                        Nothing here.
                      </td>
                    </tr>
                  )}
                  {!shut &&
                    rows.map((l, i) => (
                      <tr key={l.id} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                        <td className="col-project">
                          {l.project ? (
                            (() => {
                              const pr = projectFor(l.project);
                              return (
                                <span className="chip" style={pr ? { ['--chip' as string]: pr.color } : undefined} title={l.project}>
                                  {pr ? pr.name.replace(/^STARDVST\s+/i, '') : l.project}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="chip chip-empty">—</span>
                          )}
                        </td>
                        <td className="col-date" title={l.repeat ? `Repeats: ${describeRepeat(readRepeat(l.repeat))}` : undefined}>
                          {l.repeat ? describeRepeat(readRepeat(l.repeat)) : shortDate(l.date)}
                        </td>
                        <td className="col-task">
                          <button type="button" className="task-name" onClick={() => setEditing(l)}>
                            {l.description}
                            {linkedIds.has(l.id) && <span className="expense-link" aria-label="linked to a task" title="Linked to a task: ticking it adds this line to Expenses"> 🔗</span>}
                          </button>
                        </td>
                        <td className="col-center">{l.method}</td>
                        <td className="col-center">{l.type && <span className={`status${l.type === 'FIXED' ? ' status-three' : ''}`}>{l.type}</span>}</td>
                        <td className="col-center">{l.category}</td>
                        <td>{l.pmtCategory}</td>
                        <td className="col-amount">{l.amount === null ? '' : money(l.amount)}</td>
                        <td className="col-notes" title={l.notes}>
                          {l.notes}
                        </td>
                        <td className="col-actions">
                          <div className="timed-quick">
                            <LineMenu
                              l={l}
                              onEdit={() => setEditing(l)}
                              onCalendar={() => p.onToCalendar(l, projectFor(l.project)?.id ?? null)}
                              onLaunch={() => p.onToLaunch(l)}
                              hasTask={linkedIds.has(l.id)}
                              onTask={() => void openTaskFor(l)}
                              onRemove={() => void p.onDelete(l.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <Sheet open={!!editing} title={editing && p.lines.some((l) => l.id === editing.id) ? 'Edit line' : 'Add a line'} onClose={() => setEditing(null)} wide>
        {editing && (
          <LineForm
            key={editing.id}
            line={editing}
            isNew={!p.lines.some((l) => l.id === editing.id)}
            projects={[...new Set([...picks((l) => l.project), ...p.projects.map((x) => x.name.replace(/^STARDVST\s+/i, ''))])].sort((a, b) => a.localeCompare(b))}
            methods={picks((l) => l.method)}
            pmtCategories={picks((l) => l.pmtCategory)}
            onSave={async (l) => {
              await p.onSave(l);
              setEditing(null);
            }}
            onDelete={async (id) => {
              await p.onDelete(id);
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding} title="Add item" onClose={() => setAdding(false)} wide>
        {adding && (
          <AddItemForm
            lines={p.lines}
            tasks={p.tasks}
            projects={p.projects}
            onSave={async (r) => {
              await p.onAddItem(r);
              setAdding(false);
              if (r.task) setTaskOpen({ task: r.task, fresh: true });
            }}
          />
        )}
      </Sheet>

      <TaskSheet
        task={taskOpen?.task ?? null}
        title={taskOpen?.fresh ? 'Task details (linked to the budget)' : 'Linked task'}
        tasks={p.tasks}
        projects={p.projects}
        onSave={p.onSaveTask}
        onSaveMany={p.onSaveTasks}
        onClose={() => setTaskOpen(null)}
      />

      <Sheet open={!!linkPlan} title="Link to tasks" onClose={() => setLinkPlan(null)} wide>
        {linkPlan && (
          <div className="reminder link-plan">
            {linkPlan.remove.length + linkPlan.linked.length + linkPlan.created.length === 0 ? (
              <p className="panel-empty">Everything is already linked, with no duplicate tasks.</p>
            ) : (
              <p className="panel-empty">
                <strong>{linkPlan.linked.length}</strong> tasks linked to their budget line (the budget line's name, repeat and amount win) ·{' '}
                <strong>{linkPlan.created.length}</strong> new tasks for bills with none · <strong>{linkPlan.remove.length}</strong> duplicate tasks to Recently deleted
                (restore from ⋯ for 30 days). Variable lines stay budget-only.
              </p>
            )}
            {linkPlan.linked.length > 0 && (
              <details open>
                <summary>Linked ({linkPlan.linked.length})</summary>
                <ul>
                  {linkPlan.linked.map(({ task, line }) => (
                    <li key={task.id}>
                      <strong>{line.description}</strong> ← {p.tasks.find((t) => t.id === task.id)?.task ?? task.task}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.created.length > 0 && (
              <details>
                <summary>New tasks ({linkPlan.created.length})</summary>
                <ul>
                  {linkPlan.created.map(({ task, line }) => (
                    <li key={task.id}>
                      {line.description} <span className="link-plan-dim">· {line.repeat ? describeRepeat(readRepeat(line.repeat)) : shortDate(line.date) || 'no date'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.remove.length > 0 && (
              <details>
                <summary>Duplicates removed ({linkPlan.remove.length})</summary>
                <ul>
                  {linkPlan.remove.map((t) => (
                    <li key={t.id}>
                      {t.task} {t.description && <span className="link-plan-dim">· {t.description}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.gaps.length > 0 && (
              <details>
                <summary>Still missing ({linkPlan.gaps.length})</summary>
                <ul>
                  {linkPlan.gaps.map(({ line, missing }) => (
                    <li key={line.id}>
                      {line.description} <span className="link-plan-dim">· {missing.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="reminder-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setLinkPlan(null)}>
                Cancel
              </button>
              {linkPlan.remove.length + linkPlan.linked.length + linkPlan.created.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true);
                    await p.onApplyLinks(linkPlan);
                    setLinking(false);
                    setLinkPlan(null);
                  }}
                >
                  {linking ? 'Linking…' : 'Link and clean up'}
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!incoming} title="Import budget" onClose={() => setIncoming(null)}>
        {incoming && (
          <div className="reminder">
            {importError ? (
              <p className="panel-empty">
                <strong>{incoming.name}</strong>: {importError}
              </p>
            ) : (
              <>
                <p className="panel-empty">
                  <strong>{incoming.name}</strong> has {incoming.lines.length} lines:{' '}
                  {BUDGET_SECTIONS.map((s) => `${incoming.lines.filter((l) => l.section === s.id).length} ${s.title.toLowerCase()}`).join(', ')}.
                  {p.lines.length > 0 && ` You have ${p.lines.length} lines now.`}
                </p>
                <div className="reminder-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setIncoming(null)}>
                    Cancel
                  </button>
                  {p.lines.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={async () => {
                        const base = p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0);
                        const add = incoming.lines.map((l, i) => ({ ...l, sort: base + i }));
                        setIncoming(null);
                        await p.onReplace([...p.lines, ...add]);
                      }}
                    >
                      Add to it
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const next = incoming.lines;
                      setIncoming(null);
                      await p.onReplace(next);
                    }}
                  >
                    {p.lines.length ? 'Replace my budget' : 'Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}

function LineForm({
  line,
  isNew,
  projects,
  methods,
  pmtCategories,
  onSave,
  onDelete
}: {
  line: BudgetLine;
  isNew: boolean;
  projects: string[];
  methods: string[];
  pmtCategories: string[];
  onSave: (l: BudgetLine) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState(line);
  const formId = useId();
  const set = (patch: Partial<BudgetLine>) => setD((x) => ({ ...x, ...patch }));
  const cats = [...new Set([...BUDGET_CATEGORIES, d.category].filter(Boolean))];
  const types = [...new Set([...PMT_TYPES, d.type].filter(Boolean))];
  return (
    <form
      id={formId}
      className="task-form budget-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.description.trim()) onSave({ ...d, description: d.description.trim(), project: d.project.trim(), method: d.method.trim(), pmtCategory: d.pmtCategory.trim().toUpperCase(), notes: d.notes.trim() });
      }}
    >
      <div className="budget-grid">
        <label className="field">
          <span>Group</span>
          <select value={d.section} onChange={(e) => set({ section: e.target.value as BudgetSection })}>
            {BUDGET_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Project</span>
          <TitleCombo value={d.project} titles={projects} required={false} placeholder="APP SHOP" onChange={(project) => set({ project })} list="budget:project" />
        </div>
        <label className="field budget-wide">
          <span>Description</span>
          <input value={d.description} autoFocus={isNew} required placeholder="Minto International Rent" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="field">
          <span>Amount ($)</span>
          <input type="number" inputMode="decimal" step="any" value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={d.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />
        </label>
        <RepeatPicker
          value={readRepeat(d.repeat)}
          from={d.date}
          onChange={(r) => set({ repeat: writeRepeat(r) })}
        />
        <div className="field">
          <span>Pmt method</span>
          <TitleCombo value={d.method} titles={methods} required={false} placeholder="ATB" onChange={(method) => set({ method })} list="budget:method" />
        </div>
        <label className="field">
          <span>Pmt type</span>
          <select value={d.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">—</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Budget category</span>
          <select value={d.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Pmt category</span>
          <TitleCombo value={d.pmtCategory} titles={pmtCategories} required={false} placeholder="RENT" onChange={(pmtCategory) => set({ pmtCategory })} list="budget:pmt" />
        </div>
        <label className="field budget-wide">
          <span>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      <FormActions formId={formId} saveDisabled={!d.description.trim()} onDelete={isNew ? undefined : () => onDelete(d.id)} deleteLabel="this line" />
    </form>
  );
}
