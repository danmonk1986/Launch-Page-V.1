import { useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Icon, SearchToggle, TaskSheet, ViewToggle } from './Tasks';
import { useOpensUp } from './Launchers';
import { thisMonth } from './Expenses';
import { originalLabel, rateToCad, toCad } from '../lib/currency';
import { BudgetMonth } from './BudgetMonth';
import { LineCard, type LinePicks } from './LineCard';
import { lineDateKey, type Expense } from '../lib/expenses';
import { fromLine, planLinks, taskFor, type LinkPlan } from '../lib/links';
import { newTask, taskName, type Task } from '../lib/tasks';
import { describeRepeat, readRepeat } from '../lib/repeat';
import type { Project } from '../lib/projects';
import {
  BUDGET_CATEGORIES,
  BUDGET_SECTIONS,
  GROUP_BY,
  groupKey,
  download,
  newBudgetLine,
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
// One square button cycles the totals: layers (section), a list (payment category), a folder (project), four boxes (budget group).
const GROUP_ICON: Record<BudgetGroupBy, string> = {
  section: 'M12 3 2 8l10 5 10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
  pmtCategory: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  category: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
};
// Oct 28: the same Sync icon as the calendar.
const SYNC = 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4h-4M5.5 21v-4h4';
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
  /** ⋯ on a linked line: go to its task on the Tasks page. */
  onGoToTask: (id: string) => void;
  /** Expenses (LP-030): what was actually paid. */
  expenses: Expense[];
  /** Link and dedupe (LP-030 step 3). */
  tasks: Task[];
  onApplyLinks: (plan: LinkPlan) => Promise<void>;
};

type BudgetView = 'master' | 'month';

/** The ⋯ menu on a budget line. */
function LineMenu({ l, hasTask, onEdit, onCalendar, onLaunch, onTask, onRecalc, onRemove }: { l: BudgetLine; hasTask: boolean; onEdit: () => void; onCalendar: () => void; onLaunch: () => void; onTask: () => void; onRecalc: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const up = useOpensUp(wrap, open);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div
      ref={wrap}
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
        <div className={`row-menu-list${up ? ' is-up' : ''}`} role="menu">
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
            {hasTask ? 'Go to its task' : 'Add a task'}
          </button>
          {originalLabel(l) && (
            <button type="button" role="menuitem" title={`${originalLabel(l)} at today's rate`} onClick={run(onRecalc)}>
              Recalc to today's rate
            </button>
          )}
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
  // One Add a task at a time (a double tap made two tasks).
  const busy = useRef(false);
  const [taskOpen, setTaskOpen] = useState<{ task: Task; fresh: boolean } | null>(null);
  // Budget | Expenses (LP-030), remembered on this device.
  const [view, setViewState] = useState<BudgetView>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.view');
      return v === 'month' ? v : 'master';
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
    for (const s of BUDGET_SECTIONS) g[s.id] = p.lines.filter((l) => l.section === s.id).sort((a, b) => lineDateKey(a) - lineDateKey(b) || a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }));
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
  /** ⋯ → Add a task: a linked task from the line, then its form. A linked line goes to its task. */
  async function openTaskFor(l: BudgetLine) {
    if (busy.current) return;
    const have = taskFor(l, p.tasks);
    if (have?.budgetLineId === l.id) return p.onGoToTask(have.id);
    busy.current = true;
    if (have) {
      // A task with the same name already exists: link that one rather than adding a second.
      const t = fromLine(have, l);
      await p.onSaveTask(t);
      busy.current = false;
      return setTaskOpen({ task: t, fresh: false });
    }
    const base = newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), projectFor(l.project)?.id ?? null);
    const t = fromLine({ ...base, status: 'PENDING', notes: l.notes }, l);
    await p.onSaveTask(t);
    busy.current = false;
    setTaskOpen({ task: t, fresh: true });
  }
  /**
   * Oct 28 · line card save: the line, then its task. Every line has a linked task unless it's
   * withheld (an existing task with the same name gets linked, not doubled); withholding a line
   * that had one sends that task to Recently deleted.
   */
  async function saveLine(l: BudgetLine, withhold: boolean) {
    if (busy.current) return;
    busy.current = true;
    try {
      await p.onSave(l);
      const linked = p.tasks.find((t) => t.budgetLineId === l.id && !t.deletedAt);
      if (withhold && linked) await p.onSaveTask({ ...linked, budgetLineId: null, deletedAt: new Date().toISOString() });
      if (!withhold && !linked) {
        const same = taskFor(l, p.tasks);
        const base = same ?? { ...newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), projectFor(l.project)?.id ?? null), status: 'PENDING', notes: l.notes };
        await p.onSaveTask({ ...fromLine(base, l), projectId: base.projectId ?? projectFor(l.project)?.id ?? null });
      }
    } finally {
      busy.current = false;
    }
  }

  /** ⋯ Recalc: a line priced in another currency gets today's CAD amount. */
  const [recalcNote, setRecalcNote] = useState('');
  async function recalc(l: BudgetLine) {
    if (l.foreign == null || !l.currency) return;
    setRecalcNote(`Getting today's ${l.currency} rate…`);
    try {
      const rate = await rateToCad(l.currency);
      const amount = toCad(l.foreign, rate);
      await p.onSave({ ...l, amount });
      // Oct 30: say the rate, and say plainly when nothing moved (rates change once a business day).
      const at = `1 ${l.currency} = ${rate.toFixed(4)} CAD today`;
      setRecalcNote(
        l.amount !== null && Math.abs(l.amount - amount) < 0.005
          ? `${l.description}: no change, still ${money(amount)} (${at}). Rates update once a business day.`
          : `${l.description}: ${l.foreign} ${l.currency} is now ${money(amount)}${l.amount !== null ? ` (was ${money(l.amount)})` : ''} · ${at}.`
      );
    } catch (e) {
      setRecalcNote(e instanceof Error ? e.message : 'No rate right now.');
    }
    window.setTimeout(() => setRecalcNote(''), 6000);
  }
  /** A line's ⋯ menu (Master and Month). */
  const lineMenu = (l: BudgetLine) => (
    <LineMenu
      l={l}
      onEdit={() => setEditing(l)}
      onCalendar={() => p.onToCalendar(l, projectFor(l.project)?.id ?? null)}
      onLaunch={() => p.onToLaunch(l)}
      hasTask={linkedIds.has(l.id)}
      onTask={() => void openTaskFor(l)}
      onRecalc={() => void recalc(l)}
      onRemove={() => void p.onDelete(l.id)}
    />
  );
  /** Oct 26: an item's name goes to its task (edit is in ⋯); with no task it's plain text. */
  const itemName = (l: BudgetLine) => {
    const t = p.tasks.find((x) => x.budgetLineId === l.id && !x.deletedAt);
    return t ? (
      <button type="button" className="task-name" title="Go to its task" onClick={() => p.onGoToTask(t.id)}>
        {l.description}
      </button>
    ) : (
      <span className="item-name">{l.description}</span>
    );
  };
  const linkedIds = new Set(p.tasks.filter((t) => t.budgetLineId && !t.deletedAt).map((t) => t.budgetLineId!));
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const linePicks: LinePicks = useMemo(() => {
    const links = new Map<string, string>();
    for (const x of [...p.tasks.filter((t) => !t.deletedAt), ...p.lines]) if ((x.linkLabel ?? '').trim() && (x.link ?? '').trim()) links.set(x.linkLabel!.trim(), x.link!.trim());
    return {
      projects: [...new Set([...picks((l) => l.project), ...p.projects.map((x) => x.name.replace(/^STARDVST\s+/i, ''))])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      methods: picks((l) => l.method),
      pmtCategories: picks((l) => l.pmtCategory),
      links: [...links].map(([label, link]) => ({ label, link })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tasks, p.lines, p.projects]);

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
        <ViewToggle month={view === 'month'} listName="Master" onToggle={() => setView(view === 'month' ? 'master' : 'month')} nav={{ month, onMonth: setMonth }} />
        <div className="panel-actions">
          <SearchToggle value={q} onChange={setQ} placeholder="Search the budget" />
          {(
            <button type="button" className="icon-btn tool-btn" aria-label="Add line" title="Add a budget line (it goes to Tasks too, unless withheld)" onClick={() => setAdding(true)}>
            <Icon d={PLUS} />
          </button>
          )}
          {view === 'master' && (
          <>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Sync with Tasks"
            title="Sync with Tasks: link budget lines to their tasks, clear duplicate tasks, add tasks for bills"
            disabled={!p.lines.length}
            onClick={() => setLinkPlan(planLinks(p.lines, p.tasks, { now: new Date().toISOString(), projectFor: (n) => projectFor(n)?.id ?? null }))}
          >
            <Icon d={SYNC} />
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

      {recalcNote && (
        <p className="field-hint recalc-note" role="status">
          {recalcNote}
        </p>
      )}
      {view === 'month' && <BudgetMonth month={month} onMonth={setMonth} lines={p.lines} expenses={p.expenses} linkedIds={linkedIds} search={q} name={itemName} menu={lineMenu} />}

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
                <th className="col-task">Line item</th>
                <th className="col-center">Method</th>
                <th className="col-center">Type</th>
                <th className="col-center">Group</th>
                <th>Category</th>
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
                          {itemName(l)}
                        </td>
                        <td className="col-center">{l.method}</td>
                        <td className="col-center">{l.type && <span className={`status${l.type === 'FIXED' ? ' status-three' : ''}`}>{l.type}</span>}</td>
                        <td className="col-center">{l.category}</td>
                        <td>{l.pmtCategory}</td>
                        <td className="col-amount">
                          {l.amount === null ? '' : money(l.amount)}
                          {originalLabel(l) && <span className="money-orig">{originalLabel(l)}</span>}
                        </td>
                        <td className="col-notes" title={l.notes}>
                          {l.notes}
                        </td>
                        <td className="col-actions">
                          <div className="timed-quick">
                            {lineMenu(l)}
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

      <Sheet open={!!editing || adding} title={adding ? 'Add line' : 'Edit line'} onClose={() => (adding ? setAdding(false) : setEditing(null))} wide>
        {(adding || editing) && (() => {
          const line = adding ? newBudgetLine('planned', p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0)) : editing!;
          const hasTask = p.tasks.some((t) => t.budgetLineId === line.id && !t.deletedAt);
          return (
            <LineCard
              key={adding ? 'new' : line.id}
              line={adding ? { ...line, type: '' } : line}
              isNew={adding}
              hasTask={hasTask}
              picks={linePicks}
              onSave={async (l, withhold) => {
                await saveLine(l, withhold);
                if (adding) setAdding(false);
                else setEditing(null);
              }}
              onDelete={
                adding
                  ? undefined
                  : async () => {
                      await p.onDelete(line.id);
                      setEditing(null);
                    }
              }
            />
          );
        })()}
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

      <Sheet open={!!linkPlan} title="Sync with Tasks" onClose={() => setLinkPlan(null)} wide>
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
                      <strong>{line.description}</strong> ← {taskName(p.tasks.find((t) => t.id === task.id) ?? task)}
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

