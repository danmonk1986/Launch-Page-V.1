import { Fragment, useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { FormActions, Sheet } from './Sheet';
import { useOpensUp } from './Launchers';
import { TasksMonth } from './TasksMonth';
import { MonthNav, thisMonth } from './Expenses';
import type { Expense } from '../lib/expenses';
import { formatMinutes, toMinutes } from '../lib/routines';
import { normalizeUrl } from '../lib/launchers';
import { projectLabel, projectTree, type Project } from '../lib/projects';
import {
  doneToday,
  dueBadge,
  groupTasks,
  isRecurring,
  newStep,
  newTask,
  taskName,
  repeatOf,
  SECTIONS,
  stepsByParent,
  autoStatus,
  type Section,
  type Task
} from '../lib/tasks';
import { describeRepeat, writeRepeat, type RepeatKind } from '../lib/repeat';
import { RepeatPicker } from './RepeatPicker';

const REPEAT_BADGE: Record<RepeatKind, string> = { none: '', weekly: 'WEEKLY', monthly: 'MONTHLY', quarterly: 'QUARTERLY', annual: 'ANNUAL' };

type Common = {
  tasks: Task[];
  projects: Project[];
  today: Date;
  onSave: (t: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Push to Budget: a budget line for this task, linked (amount from Notes). */
  onPushToBudget?: (t: Task) => Promise<void>;
};

const LIST_ICON = 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01';
const CAL_ICON = 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 3v4M15 3v4';

/** Oct 28: one square button flips a page between its list and Month (calendar) views. */
export function ViewToggle({ month, listName, onToggle, nav }: { month: boolean; listName: string; onToggle: () => void; nav?: { month: string; onMonth: (m: string) => void } }) {
  const label = month ? `Month view: tap for ${listName}` : `${listName}: tap for Month view`;
  return (
    <div className="view-switch">
      <button type="button" className="icon-btn tool-btn view-toggle" aria-label={label} title={label} onClick={onToggle}>
        <Icon d={month ? CAL_ICON : LIST_ICON} size={18} />
      </button>
      {month && nav && <MonthNav month={nav.month} onChange={nav.onMonth} />}
    </div>
  );
}

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const PLUS = 'M12 5v14M5 12h14';
const CLOSE = 'M6 6l12 12M18 6L6 18';
/** The Launch Page shows tasks without their steps. */
const NO_STEPS = new Map<string, Task[]>();
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';

/** Check off: one-off tasks are done; recurring ones are done for today and come back next time. */
export function toggleDone(t: Task): Task {
  const now = new Date().toISOString();
  if (isRecurring(t)) return { ...t, doneAt: doneToday(t, new Date()) ? null : now };
  return t.done ? { ...t, done: false, doneAt: null, cleared: false } : { ...t, done: true, doneAt: now };
}

function ProjectChip({ projects, id }: { projects: Project[]; id: string | null }) {
  const p = projects.find((x) => x.id === id);
  if (!p) return <span className="chip chip-empty">—</span>;
  return (
    <span className="chip" style={{ ['--chip' as string]: p.color }} title={projectLabel(projects, id)}>
      {p.name.replace(/^STARDVST\s+/i, '')}
    </span>
  );
}

/** Everything a row can do. */
type Actions = {
  toggle: (t: Task) => void;
  edit: (t: Task) => void;
  /** Tapping a task's name: edit it here, or (on the Launch Page) go to it on the Tasks page. */
  open: (t: Task) => void;
  addStep: (parent: Task) => void;
  moveTo: (t: Task, iso: string) => void;
  remove: (t: Task) => void;
  restore: (t: Task) => void;
  setStatus: (t: Task, status: string) => void;
  purge: (t: Task) => void;
  clear: (t: Task) => void;
  toCalendar: (t: Task) => void;
  toLaunch: (t: Task) => void;
};

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The ⋯ menu on a row. */
function RowMenu({ t, act, checked }: { t: Task; act: Actions; checked: boolean }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const up = useOpensUp(wrap, open);
  const tomorrow = isoOf(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1, 12));
  const [date, setDate] = useState(t.endDate ?? tomorrow);
  const close = () => {
    setOpen(false);
    setPicking(false);
  };
  const run = (fn: () => void) => () => {
    fn();
    close();
  };
  return (
    <div
      ref={wrap}
      className="row-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <button
        type="button"
        className="quick-btn quick-skip task-quick"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More for ${taskName(t)}`}
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon d="M5 12h.01M12 12h.01M19 12h.01" size={18} />
      </button>
      {open && t.deletedAt && (
        <div className={`row-menu-list${up ? ' is-up' : ''}`} role="menu">
          <button type="button" role="menuitem" onClick={run(() => act.restore(t))}>
            Restore
          </button>
          <button type="button" role="menuitem" className="menu-danger" onClick={run(() => act.purge(t))}>
            Delete forever
          </button>
        </div>
      )}
      {open && !t.deletedAt && (
        <div className={`row-menu-list${up ? ' is-up' : ''}`} role="menu">
          <button type="button" role="menuitem" onClick={run(() => act.edit(t))}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={run(() => act.toCalendar(t))}>
            {t.googleEventId ? 'Add to calendar again' : 'Add to calendar'}
          </button>
          <button type="button" role="menuitem" onClick={run(() => act.toLaunch(t))}>
            {t.launchId ? 'Create launch again' : 'Create launch'}
          </button>
          <button type="button" role="menuitem" onClick={run(() => act.addStep(t))}>
            Add a step
          </button>
          {!isRecurring(t) && !checked && (
            <>
              <button type="button" role="menuitem" onClick={run(() => act.moveTo(t, tomorrow))}>
                Move to tomorrow
              </button>
              {picking ? (
                <div className="row-menu-date">
                  <input type="date" aria-label="Move to date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
                  <button type="button" className="btn" disabled={!date} onClick={run(() => act.moveTo(t, date))}>
                    Move
                  </button>
                </div>
              ) : (
                <button type="button" role="menuitem" onClick={() => setPicking(true)}>
                  Move to…
                </button>
              )}
            </>
          )}
          {checked && !isRecurring(t) && (
            <button type="button" role="menuitem" onClick={run(() => act.clear(t))}>
              Clear from Completed
            </button>
          )}
          <button type="button" role="menuitem" className="menu-danger" onClick={run(() => act.remove(t))}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

const PHONE = /^\+?[\d\s().-]{7,}$/;

/** Info: a link, or a phone number you can tap to call. */
export function InfoLink({ t }: { t: Task }) {
  const v = t.link.trim();
  if (!v) return <>{t.linkLabel}</>;
  if (PHONE.test(v)) return <a href={`tel:${v.replace(/[^\d+]/g, '')}`}>{t.linkLabel || v}</a>;
  return (
    <a href={normalizeUrl(v)} target="_blank" rel="noopener noreferrer">
      {t.linkLabel || 'Open'}
    </a>
  );
}

/** Done ✓ and ⋯ for a task row (List and Month views). */
function RowActions({ t, act, checked }: { t: Task; act: Actions; checked: boolean }) {
  return (
    <div className="timed-quick">
      {!t.deletedAt && (
        <button
          type="button"
          className="quick-btn quick-done task-quick"
          aria-pressed={checked}
          aria-label={checked ? `Undo done: ${taskName(t)}` : `Check off ${taskName(t)}`}
          title={checked ? 'Undo' : 'Done'}
          onClick={() => act.toggle(t)}
        >
          <Icon d="M5 12.5l4.5 4.5L19 7.5" />
        </button>
      )}
      <RowMenu t={t} act={act} checked={checked} />
    </div>
  );
}

function TaskRow({ t, step, alt, projects, today, act }: { t: Task; step?: boolean; alt?: boolean; projects: Project[]; today: Date; act: Actions }) {
  const badge = dueBadge(t, today);
  const checked = isRecurring(t) ? doneToday(t, today) : t.done;
  return (
    <tr id={`task-${t.id}`} className={`task-row${checked ? ' is-done' : ''}${step ? ' is-step' : ''}${alt ? ' is-alt' : ''}`}>
      <td className="col-project">{step ? null : <ProjectChip projects={projects} id={t.projectId} />}</td>
      <td className="col-task">
        {!step && (
          <span className="task-cell">
            <button type="button" className="task-name" onClick={() => act.open(t)}>
              {t.task || t.description}
              {t.task && t.description && <span className="task-desc-inline"> · {t.description}</span>}
            </button>
            <button type="button" className="step-add" aria-label={`Add a step under ${taskName(t)}`} title="Add a step" onClick={() => act.addStep(t)}>
              +
            </button>
          </span>
        )}
      </td>
      {/* Oct 28: steps are the specific part, so they sit under Description. */}
      <td className="col-desc">
        {step ? (
          <span className="task-cell step-cell">
            <span className="step-mark" aria-hidden="true">↳</span>
            <button type="button" className="task-name" onClick={() => act.open(t)}>
              {t.task}
            </button>
          </span>
        ) : (
          t.description
        )}
      </td>
      <td className="col-status col-center">
        {!step && (() => {
          // Recurring tasks show how they repeat (WEEKLY, MONTHLY…) in place of a status.
          if (isRecurring(t)) {
            const shown = badge ?? REPEAT_BADGE[repeatOf(t).kind];
            return <span className={`status status-${shown.replace(/\s+/g, '-').toLowerCase()}`}>{shown}</span>;
          }
          // Oct 28: status is automatic; this dropdown only picks a key task (THREE).
          const auto = autoStatus(t, today);
          const key = t.status === 'THREE';
          const shown = key ? 'THREE' : auto;
          return (
            <select
              className={`status status-pick status-${shown.replace(/\s+/g, '-').toLowerCase()}`}
              aria-label={`Status: ${shown}`}
              title={key ? 'Key task: pick the other to take it off' : 'Worked out from the date: pick THREE for a key task'}
              value={key ? 'THREE' : 'AUTO'}
              onChange={(e) => act.setStatus(t, e.target.value === 'THREE' ? 'THREE' : 'PENDING')}
            >
              <option value="AUTO">{auto}</option>
              <option value="THREE">THREE</option>
            </select>
          );
        })()}
      </td>
      <td className="col-link col-info col-center">
        <InfoLink t={t} />
      </td>
      <td className="col-date col-start col-center">{isRecurring(t) ? describeRepeat(repeatOf(t)) : shortDate(t.startDate)}</td>
      <td className="col-date col-center">{isRecurring(t) ? '' : shortDate(t.endDate)}</td>
      <td className="col-time col-center">{t.atTime ? formatMinutes(toMinutes(t.atTime)) : ''}</td>
      <td className="col-expense col-center">{t.expense}</td>
      <td className="col-actions">
        <RowActions t={t} act={act} checked={checked} />
      </td>
    </tr>
  );
}

function TaskTable({
  sections,
  grouped,
  steps,
  projects,
  today,
  act,
  collapsible,
  focusId
}: {
  focusId?: string | null;
  sections: Section[];
  grouped: Record<Section, Task[]>;
  steps: Map<string, Task[]>;
  projects: Project[];
  today: Date;
  act: Actions;
  collapsible?: boolean;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ done: true, monthly: true, annual: true, deleted: true });
  // Open the group holding a task you jumped to.
  useEffect(() => {
    if (!focusId) return;
    const sec = (Object.keys(grouped) as Section[]).find((k) => grouped[k].some((t) => t.id === focusId));
    if (sec && closed[sec]) setClosed((c) => ({ ...c, [sec]: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);
  return (
    <div className="task-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th className="col-project">Project</th>
            <th className="col-task">Task</th>
            <th className="col-desc">Description</th>
            <th className="col-center">Status</th>
            <th className="col-info col-center">Info</th>
            <th className="col-start col-center">Start</th>
            <th className="col-center">Required</th>
            <th className="col-time col-center">Time</th>
            <th className="col-expense col-center">Expense</th>
            <th className="col-actions" aria-label="Done or more" />
          </tr>
        </thead>
        {sections.map((id) => {
          const s = SECTIONS.find((x) => x.id === id)!;
          const rows = grouped[id];
          const shut = collapsible && closed[id];
          // Empty groups stay out of the way; Due today hides too when nothing is due.
          if (!rows.length && id === 'due') return null;
          if (collapsible && !rows.length && id !== 'key') return null;
          return (
            <tbody key={id}>
              <tr className="task-section">
                <th colSpan={10} scope="rowgroup">
                  {collapsible ? (
                    <button type="button" className="section-btn" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [id]: !c[id] }))}>
                      <span className="section-caret" aria-hidden="true">
                        {shut ? '›' : '⌄'}
                      </span>
                      {s.title} <span className="section-count">{rows.length}</span>
                    </button>
                  ) : (
                    <>
                      {s.title} <span className="section-count">{rows.length}</span>
                    </>
                  )}
                </th>
              </tr>
              {!shut && rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="task-empty">
                    {id === 'key' ? 'Set a task to THREE to make it one of your 3 key tasks.' : 'Nothing here.'}
                  </td>
                </tr>
              )}
              {!shut &&
                rows.map((t, i) => (
                  <Fragment key={t.id}>
                    <TaskRow t={t} alt={i % 2 === 1} projects={projects} today={today} act={act} />
                    {(steps.get(t.id) ?? []).map((st) => (
                      <TaskRow key={st.id} t={st} step alt={i % 2 === 1} projects={projects} today={today} act={act} />
                    ))}
                  </Fragment>
                ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

type EditorProps = Common & { onSaveMany: (t: Task[]) => Promise<void> };

/**
 * The task form on its own (LP-030): Budget opens it for a budget line's linked task, so the
 * task's details (description, status, steps, link, time) are filled in the usual form.
 */
export function TaskSheet(p: { task: Task | null; title: string; tasks: Task[]; projects: Project[]; onSave: (t: Task) => Promise<void>; onSaveMany: (t: Task[]) => Promise<void>; onPushToBudget?: (t: Task) => Promise<void>; onClose: () => void }) {
  const t = p.task;
  return (
    <Sheet open={!!t} title={p.title} onClose={p.onClose} wide>
      {t && (
        <TaskForm
          key={t.id}
          task={t}
          isNew={false}
          isStep={false}
          existingSteps={stepsByParent(p.tasks).get(t.id) ?? []}
          picks={formPicks(p.tasks)}
          projects={p.projects}
          onCancel={p.onClose}
          onSave={async (next, newSteps, push) => {
            const base = p.tasks.reduce((m, x) => Math.max(m, x.sort + 1), 0);
            const kids = newSteps.filter((x) => x.trim()).map((x, i) => newStep(next, x, base + i));
            if (kids.length) await p.onSaveMany([next, ...kids]);
            else await p.onSave(next);
            if (push) await p.onPushToBudget?.(next);
            p.onClose();
          }}
          onDelete={async (id) => {
            const found = p.tasks.find((x) => x.id === id) ?? t;
            await p.onSave({ ...found, deletedAt: new Date().toISOString() });
            p.onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function useTaskEditor(p: EditorProps) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  // Checking off a task that still has open steps asks first.
  const [ask, setAsk] = useState<{ task: Task; open: Task[] } | null>(null);
  const isNew = !!editing && !p.tasks.some((t) => t.id === editing.id);
  const parent = editing?.parentId ? p.tasks.find((t) => t.id === editing.parentId) ?? null : null;
  const askSheet = (
    <Sheet open={!!ask} title="Steps still open" onClose={() => setAsk(null)}>
      {ask && (
        <div className="reminder">
          <p className="panel-empty">
            <strong>{taskName(ask.task)}</strong> has {ask.open.length} open {ask.open.length === 1 ? 'step' : 'steps'}: {ask.open.map((x) => x.task).join(', ')}. Are they done too?
          </p>
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setAsk(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                const t = ask.task;
                setAsk(null);
                await p.onSave(toggleDone(t));
              }}
            >
              Just the task
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const { task, open: steps } = ask;
                setAsk(null);
                await p.onSaveMany([toggleDone(task), ...steps.map(toggleDone)]);
              }}
            >
              All done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
  const sheet = (
    <>
    {askSheet}
    <Sheet open={open} title={parent ? (isNew ? `Add a step to ${taskName(parent)}` : 'Edit step') : isNew ? 'Add task' : 'Edit task'} onClose={() => setOpen(false)} wide>
      {editing && (
        <TaskForm
          key={editing.id}
          task={editing}
          isNew={isNew}
          isStep={!!editing.parentId}
          existingSteps={stepsByParent(p.tasks).get(editing.id) ?? []}
          picks={formPicks(p.tasks)}
          projects={p.projects}
          onCancel={() => setOpen(false)}
          onSave={async (t, newSteps, push) => {
            const base = p.tasks.reduce((m, x) => Math.max(m, x.sort + 1), 0);
            const kids = newSteps.filter((s) => s.trim()).map((s, i) => newStep(t, s, base + i));
            if (kids.length) await p.onSaveMany([t, ...kids]);
            else await p.onSave(t);
            if (push) await p.onPushToBudget?.(t);
            setOpen(false);
          }}
          onDelete={async (id) => {
            // Delete in the form also goes to Recently deleted.
            const t = p.tasks.find((x) => x.id === id);
            if (t) await p.onSave({ ...t, deletedAt: new Date().toISOString() });
            setOpen(false);
          }}
        />
      )}
    </Sheet>
    </>
  );
  return {
    sheet,
    edit: (t: Task) => {
      setEditing(t);
      setOpen(true);
    },
    add: () => {
      setEditing(newTask(p.tasks.length));
      setOpen(true);
    },
    addStep: (picked: Task) => {
      // "Add a step" on a step adds another step to the same task (steps don't nest).
      const parentTask = picked.parentId ? p.tasks.find((x) => x.id === picked.parentId) ?? picked : picked;
      setEditing(newStep(parentTask, '', p.tasks.reduce((m, x) => Math.max(m, x.sort + 1), 0)));
      setOpen(true);
    },
    askDone: setAsk
  };
}

type PageProps = EditorProps & {
  onAddToCalendar: (t: Task) => void;
  onCreateLaunch: (t: Task) => void;
};

function useActions(p: PageProps, editor: ReturnType<typeof useTaskEditor>, open?: (t: Task) => void): Actions {
  return {
    toggle: (t) => {
      const openSteps = !t.done && !t.parentId && !isRecurring(t) ? (stepsByParent(p.tasks).get(t.id) ?? []).filter((x) => !x.done && !x.deletedAt) : [];
      if (openSteps.length) editor.askDone({ task: t, open: openSteps });
      else p.onSave(toggleDone(t));
    },
    edit: editor.edit,
    open: open ?? editor.edit,
    addStep: editor.addStep,
    moveTo: (t, iso) => p.onSave({ ...t, endDate: iso, startDate: t.startDate && t.startDate > iso ? iso : t.startDate }),
    remove: (t) => p.onSave({ ...t, deletedAt: new Date().toISOString() }),
    restore: (t) => p.onSave({ ...t, deletedAt: null }),
    setStatus: (t, status) => p.onSave({ ...t, status }),
    purge: (t) => p.onDelete(t.id),
    clear: (t) => p.onSave({ ...t, cleared: true }),
    toCalendar: p.onAddToCalendar,
    toLaunch: p.onCreateLaunch
  };
}

/** Launch Page: just Due today and the 3 key tasks. */
export function TasksPanel(p: PageProps & { onOpenAll: () => void; onOpenTask: (t: Task) => void }) {
  const editor = useTaskEditor(p);
  const act = useActions(p, editor, p.onOpenTask);
  const grouped = groupTasks(p.tasks, p.today);
  return (
    <section className="panel panel-tasks" aria-labelledby="h-tasks">
      <div className="panel-head">
        <h2 id="h-tasks" className="panel-title">
          <button type="button" className="title-btn" onClick={p.onOpenAll} title="Open the Tasks page">
            Tasks
          </button>
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Add task" title="Add task" onClick={editor.add}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>
      <TaskTable sections={['due', 'key']} grouped={grouped} steps={NO_STEPS} projects={p.projects} today={p.today} act={act} />
      {editor.sheet}
    </section>
  );
}

/** The Tasks page: the whole list, in the Launch Sheet's sections. */
const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.3-4.3';

/** 🔍 in a page's header: opens a search box; Esc or ✕ clears and closes it (Oct 22). */
export function SearchToggle({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  if (!open && !value)
    return (
      <button type="button" className="icon-btn tool-btn" aria-label="Search" title="Search" onClick={() => setOpen(true)}>
        <Icon d={SEARCH} />
      </button>
    );
  return (
    <span className="search-box">
      <input
        autoFocus
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label="Search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className="icon-btn tool-btn"
        aria-label="Close search"
        title="Close search"
        onClick={() => {
          onChange('');
          setOpen(false);
        }}
      >
        <Icon d={CLOSE} />
      </button>
    </span>
  );
}

export function TasksPage(
  p: PageProps & {
    onOpenProjects: () => void;
    onClose: () => void;
    focusId?: string | null;
    /** Month view (LP-030 step 6): Paid comes from Expenses. */
    expenses?: Expense[];
  }
) {
  const editor = useTaskEditor(p);
  const [layout, setLayoutState] = useState<'list' | 'month'>(() => {
    try {
      return localStorage.getItem('launchpage.tasks.view') === 'month' ? 'month' : 'list';
    } catch {
      return 'list';
    }
  });
  const setLayout = (v: 'list' | 'month') => {
    setLayoutState(v);
    try {
      localStorage.setItem('launchpage.tasks.view', v);
    } catch {
      /* ignore */
    }
  };
  const [month, setMonth] = useState(thisMonth);
  const act = useActions(p, editor);
  const [view, setView] = useState<Section | null>(null);
  // Search: a task matches on its name, description, notes, info or project; its steps come with
  // it, and a matching step brings its task.
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hit = (t: Task) =>
    [t.task, t.description, t.notes, t.linkLabel, t.expense, p.projects.find((x) => x.id === t.projectId)?.name ?? ''].some((v) => (v ?? '').toLowerCase().includes(needle));
  const byId = new Map(p.tasks.map((t) => [t.id, t]));
  const shown = !needle
    ? p.tasks
    : p.tasks.filter((t) => hit(t) || (t.parentId && byId.get(t.parentId) && hit(byId.get(t.parentId)!)) || p.tasks.some((s) => s.parentId === t.id && hit(s)));
  const grouped = groupTasks(shown, p.today);
  // ALL counts what's still outstanding: not done, not deleted.
  const outstanding = Object.entries(grouped).reduce((n, [k, l]) => (k === 'deleted' || k === 'done' ? n : n + l.length), 0);
  // Arriving from the Launch Page: scroll to the task and light it up.
  useEffect(() => {
    if (!p.focusId) return;
    // The task is found in List view (Month rows aren't the full list).
    if (layout !== 'list') setLayoutState('list');
    const t = window.setTimeout(() => {
      const row = document.getElementById(`task-${p.focusId}`);
      if (!row) return;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('is-focus');
      window.setTimeout(() => row.classList.remove('is-focus'), 2600);
    }, 150);
    return () => window.clearTimeout(t);
  }, [p.focusId]);
  return (
    <section className="panel panel-tasks-page" aria-labelledby="h-tasks-page">
      <div className="panel-head">
        <h2 id="h-tasks-page" className="panel-title">
          Tasks
        </h2>
        <ViewToggle month={layout === 'month'} listName="List" onToggle={() => setLayout(layout === 'month' ? 'list' : 'month')} nav={{ month, onMonth: setMonth }} />
        <div className="panel-actions">
          <SearchToggle value={q} onChange={setQ} placeholder="Search tasks" />
          <button type="button" className="icon-btn tool-btn" aria-label="Add task" title="Add task" onClick={editor.add}>
            <Icon d={PLUS} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Projects" title="Areas and projects" onClick={p.onOpenProjects}>
            <Icon d={FOLDER} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>
      {layout === 'month' && (
        <TasksMonth
          month={month}
          onMonth={setMonth}
          tasks={p.tasks}
          projects={p.projects}
          expenses={p.expenses ?? []}
          search={(t) => !needle || hit(t)}
          onOpen={editor.edit}
          actions={(t) => <RowActions t={t} act={act} checked={isRecurring(t) ? doneToday(t, p.today) : t.done} />}
        />
      )}
      {layout === 'list' && (
      <>
      <PillRow
        pills={[
          { id: null, label: 'Active', count: outstanding },
          ...SECTIONS.map((sec) => ({ id: sec.id, label: sec.pill ?? sec.title, count: grouped[sec.id].length, hint: sec.hint }))
        ]}
        value={view}
        onPick={(id) => setView(id === null || view === id ? null : id)}
      />
      <TaskTable
        key={view ?? 'all'}
        sections={view ? [view] : SECTIONS.map((s) => s.id)}
        grouped={grouped}
        steps={stepsByParent(shown)}
        projects={p.projects}
        today={p.today}
        act={act}
        collapsible={!view && !needle}
        focusId={p.focusId ?? null}
      />
      </>
      )}
      {editor.sheet}
    </section>
  );
}

/** Oct 28: what the pick-lists offer — Task kinds, Descriptions and Info names you've used, A→Z. */
export type FormPicks = { kinds: string[]; specifics: string[]; links: { label: string; link: string }[] };
export function formPicks(tasks: Task[]): FormPicks {
  const top = tasks.filter((x) => !x.parentId && !x.deletedAt);
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const links = new Map<string, string>();
  for (const t of [...top].sort((a, b) => a.sort - b.sort)) if (t.linkLabel.trim() && t.link.trim()) links.set(t.linkLabel.trim(), t.link.trim());
  return { kinds: uniq(top.map((x) => x.task)), specifics: uniq(top.map((x) => x.description)), links: [...links].map(([label, link]) => ({ label, link })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })) };
}

/**
 * The Add / Edit task card (Oct 28 wireframe): Project | Task, Description, Steps, Date required | Repeat,
 * Start | Time, Info link | Link name, Notes + Push to Budget. Status is worked out from the dates
 * (3 key tasks are picked in the table); an expense goes to Budget, written in Notes.
 */
function TaskForm({
  task,
  isNew,
  isStep,
  existingSteps,
  picks,
  projects,
  onSave,
  onDelete
}: {
  task: Task;
  isNew: boolean;
  isStep: boolean;
  existingSteps: Task[];
  picks: FormPicks;
  projects: Project[];
  onCancel?: () => void;
  /** newSteps: names typed into the Steps list, created underneath on save. push: also put it in Budget. */
  onSave: (t: Task, newSteps: string[], push: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Task>(task);
  const [steps, setSteps] = useState<string[]>([]);
  const [push, setPush] = useState(false);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setD((x) => ({ ...x, [k]: v }));
  const [rep, setRep] = useState(() => repeatOf(task));
  const recurring = rep.kind !== 'none';
  const tree = projectTree(projects);
  const formId = useId();
  const linked = !!task.budgetLineId;
  const named = isStep ? !!d.task.trim() : !!(d.task.trim() || d.description.trim());
  // Picking an Info name you've used fills in its link (if the link box is empty).
  const pickLabel = (label: string) => {
    const hit = picks.links.find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
    setD((x) => ({ ...x, linkLabel: label, link: hit && !x.link.trim() ? hit.link : x.link }));
  };
  return (
    <form
      id={formId}
      className="task-form task-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!named) return;
        const endDate = d.endDate && d.startDate && d.endDate < d.startDate ? d.startDate : d.endDate;
        const repeatRule = writeRepeat(rep);
        // Status is automatic now; only THREE (a key task) is kept.
        const status = d.status === 'THREE' ? 'THREE' : 'PENDING';
        await onSave({ ...d, task: d.task.trim(), description: d.description.trim(), notes: d.notes.trim(), endDate: recurring ? null : endDate, repeatRule, status }, steps, push && !linked);
      }}
    >
      {isStep ? (
        <label className="field">
          <span>Step</span>
          <input required value={d.task} onChange={(e) => set('task', e.target.value)} placeholder="Next step" />
        </label>
      ) : (
        <>
          <div className="time-grid">
            <label className="field">
              <span>Project</span>
              <select value={d.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
                <option value="">No project</option>
                {tree.map(({ area, children }) => (
                  <optgroup key={area.id} label={area.name}>
                    <option value={area.id}>{area.name}</option>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {area.name} › {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Task</span>
              <input list="task-kinds" autoComplete="off" value={d.task} onChange={(e) => set('task', e.target.value)} placeholder="Appointment, EOM BILL…" />
              <datalist id="task-kinds">
                {picks.kinds.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <input list="task-specifics" autoComplete="off" value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="Dentist, Wix, Find Garage Rental" />
            <datalist id="task-specifics">
              {picks.specifics.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <div className="field steps-field">
            <span>Steps</span>
            {existingSteps.length > 0 && (
              <ul className="steps-list">
                {existingSteps.map((st) => (
                  <li key={st.id} className={st.done ? 'is-done' : ''}>
                    ↳ {st.task}
                  </li>
                ))}
              </ul>
            )}
            {steps.map((text, i) => (
              <div key={i} className="step-input">
                <span aria-hidden="true">↳</span>
                <input
                  aria-label={`Step ${existingSteps.length + i + 1}`}
                  value={text}
                  autoFocus={i === steps.length - 1}
                  onChange={(e) => setSteps((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setSteps((list) => [...list, '']);
                    }
                  }}
                  placeholder="Next step"
                />
              </div>
            ))}
            <button type="button" className="link-btn link-btn-inline step-more" onClick={() => setSteps((list) => [...list, ''])}>
              + Add a step
            </button>
          </div>
        </>
      )}
      <div className={`time-grid task-when${recurring ? ' is-recurring' : ''}`}>
        {!recurring && (
          <label className="field">
            <span>Date required</span>
            <input type="date" min={d.startDate ?? undefined} value={d.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
          </label>
        )}
        <RepeatPicker value={rep} onChange={setRep} from={d.endDate ?? d.startDate} />
      </div>
      <div className="time-grid">
        {!recurring ? (
          <label className="field">
            <span>Date start</span>
            <input type="date" value={d.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
          </label>
        ) : null}
        <label className="field">
          <span>Time</span>
          <input type="time" value={d.atTime ?? ''} onChange={(e) => set('atTime', e.target.value || null)} />
        </label>
      </div>
      {!isStep && (
        <div className="time-grid">
          <label className="field">
            <span>Info link</span>
            <input value={d.link} onChange={(e) => set('link', e.target.value)} placeholder="https://… or 780-555-0123" />
          </label>
          <label className="field">
            <span>Link name</span>
            <input list="task-link-names" autoComplete="off" value={d.linkLabel} onChange={(e) => pickLabel(e.target.value)} placeholder="RENTFASTER" />
            <datalist id="task-link-names">
              {picks.links.map((x) => (
                <option key={x.label} value={x.label} />
              ))}
            </datalist>
          </label>
        </div>
      )}
      <div className="notes-row">
        <label className="field">
          <span>Notes</span>
          <input value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder={isStep ? '' : 'e.g. 1140 USD'} />
        </label>
        {!isStep &&
          (linked ? (
            <span className="choice push-pick is-on" title="Linked to a budget line">
              <span className="expense-link">$$$</span> In Budget
            </span>
          ) : (
            <label className="choice push-pick" title="Adds a budget line for this, with the amount written in Notes (e.g. 1140 USD)">
              <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
              <span>Push to Budget</span>
            </label>
          ))}
      </div>
      <FormActions formId={formId} saveDisabled={!named} onDelete={!isNew ? () => onDelete(task.id) : undefined} deleteLabel={taskName(task)} />
    </form>
  );
}

/**
 * One row of filter pills. Pills that don't fit move into a ⌄ menu at the end of the row
 * instead of wrapping to a second line.
 */
export function PillRow<T extends string | null>({ pills, value, onPick }: { pills: { id: T; label: string; count: number; hint?: string }[]; value: T | null; onPick: (id: T) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const widths = useRef<number[]>([]);
  const [fit, setFit] = useState(pills.length);
  const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const kids = Array.from(el.querySelectorAll<HTMLElement>(':scope > .area-pill'));
      kids.forEach((k, i) => {
        if (k.offsetWidth) widths.current[i] = k.offsetWidth;
      });
      const gap = parseFloat(getComputedStyle(el).columnGap) || 4;
      const avail = el.clientWidth;
      const w = pills.map((_, i) => widths.current[i] ?? 90);
      const all = w.reduce((a, x) => a + x + gap, -gap);
      if (all <= avail) return setFit(pills.length);
      const more = 44 + gap;
      let used = 0;
      let n = 0;
      while (n < w.length && used + w[n] + (n ? gap : 0) + more <= avail) {
        used += w[n] + (n ? gap : 0);
        n += 1;
      }
      setFit(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pills.length, pills.map((p) => p.count).join()]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!row.current?.contains(e.target as Node)) setOpen(null);
    };
    const shut = () => setOpen(null);
    document.addEventListener('mousedown', off);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [open]);
  const hidden = pills.slice(fit);
  const pill = (p: (typeof pills)[number], i: number, inMenu = false) => (
    <button
      key={String(p.id)}
      type="button"
      className="area-pill"
      aria-pressed={value === p.id}
      title={p.hint}
      hidden={!inMenu && i >= fit}
      onClick={() => {
        onPick(p.id);
        setOpen(null);
      }}
    >
      {p.label} <span className="pill-count">{p.count}</span>
    </button>
  );
  return (
    <div className="area-filter pill-row" role="group" aria-label="Show" ref={row}>
      {pills.map((p, i) => pill(p, i))}
      {hidden.length > 0 && (
        <div className="pill-more">
          <button
            type="button"
            className="area-pill pill-more-btn"
            aria-expanded={!!open}
            aria-pressed={hidden.some((p) => p.id === value)}
            aria-label={`${hidden.length} more`}
            title={`${hidden.length} more`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setOpen((o) => (o ? null : { top: r.bottom + 6, right: window.innerWidth - r.right }));
            }}
          >
            ⌄
          </button>
          {open && <div className="pill-menu" style={{ top: open.top, right: open.right }}>{hidden.map((p, i) => pill(p, fit + i, true))}</div>}
        </div>
      )}
    </div>
  );
}
