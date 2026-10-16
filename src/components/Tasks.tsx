import { Fragment, useState, useId } from 'react';
import { FormActions, Sheet } from './Sheet';
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
  SECTIONS,
  STATUS_LABEL,
  STATUSES,
  stepsByParent,
  type Section,
  type Task
} from '../lib/tasks';

type Common = {
  tasks: Task[];
  projects: Project[];
  today: Date;
  onSave: (t: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const PLUS = 'M12 5v14M5 12h14';
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';

const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';

/** ✗ on an open task: date required becomes tomorrow (start too, if it was later). */
export function toTomorrow(t: Task): Task {
  const d = new Date();
  const tm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12);
  const iso = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`;
  return { ...t, endDate: iso, startDate: t.startDate && t.startDate > iso ? iso : t.startDate };
}

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
  addStep: (parent: Task) => void;
  moveTo: (t: Task, iso: string) => void;
  remove: (t: Task) => void;
  restore: (t: Task) => void;
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
        aria-label={`More for ${t.task}`}
        title="More"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon d="M5 12h.01M12 12h.01M19 12h.01" size={18} />
      </button>
      {open && t.deletedAt && (
        <div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={run(() => act.restore(t))}>
            Restore
          </button>
          <button type="button" role="menuitem" className="menu-danger" onClick={run(() => act.purge(t))}>
            Delete forever
          </button>
        </div>
      )}
      {open && !t.deletedAt && (
        <div className="row-menu-list" role="menu">
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

const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN', 'JPY'];
/** "1140 USD" ⇄ { amount: "1140", currency: "USD" }; plain numbers are CAD. */
function splitExpense(v: string) {
  const m = v.trim().match(/^(.*?)\s*([A-Za-z]{3})$/);
  return m && CURRENCIES.includes(m[2].toUpperCase()) ? { amount: m[1].trim(), currency: m[2].toUpperCase() } : { amount: v.trim(), currency: 'CAD' };
}
const joinExpense = (amount: string, currency: string) => (amount.trim() ? `${amount.trim()} ${currency}` : '');

const PHONE = /^\+?[\d\s().-]{7,}$/;

/** Info: a link, or a phone number you can tap to call. */
function InfoLink({ t }: { t: Task }) {
  const v = t.link.trim();
  if (!v) return <>{t.linkLabel}</>;
  if (PHONE.test(v)) return <a href={`tel:${v.replace(/[^\d+]/g, '')}`}>{t.linkLabel || v}</a>;
  return (
    <a href={normalizeUrl(v)} target="_blank" rel="noopener noreferrer">
      {t.linkLabel || 'Open'}
    </a>
  );
}

function TaskRow({ t, step, alt, projects, today, act }: { t: Task; step?: boolean; alt?: boolean; projects: Project[]; today: Date; act: Actions }) {
  const badge = dueBadge(t, today);
  const checked = isRecurring(t) ? doneToday(t, today) : t.done;
  return (
    <tr className={`task-row${checked ? ' is-done' : ''}${step ? ' is-step' : ''}${alt ? ' is-alt' : ''}`}>
      <td className="col-project">{step ? <span className="step-mark" aria-hidden="true">↳</span> : <ProjectChip projects={projects} id={t.projectId} />}</td>
      <td className="col-desc">{step ? '' : t.description}</td>
      <td className="col-task">
        <span className="task-cell">
          <button type="button" className="task-name" onClick={() => act.edit(t)}>
            {t.task}
          </button>
          {!step && (
            <button type="button" className="step-add" aria-label={`Add a step under ${t.task}`} title="Add a step" onClick={() => act.addStep(t)}>
              +
            </button>
          )}
        </span>
      </td>
      <td className="col-status col-center">
        {!step && <span className={`status status-${(badge ?? t.status).replace(/\s+/g, '-').toLowerCase()}`}>{badge ?? t.status}</span>}
      </td>
      <td className="col-link col-center">
        <InfoLink t={t} />
      </td>
      <td className="col-date col-center">{isRecurring(t) ? describeRule(t) : shortDate(t.startDate)}</td>
      <td className="col-date col-center">{isRecurring(t) ? '' : shortDate(t.endDate)}</td>
      <td className="col-time col-center">{t.atTime ? formatMinutes(toMinutes(t.atTime)) : ''}</td>
      <td className="col-expense col-center">{t.expense}</td>
      <td className="col-actions">
        <div className="timed-quick">
          {!t.deletedAt && <button
            type="button"
            className="quick-btn quick-done task-quick"
            aria-pressed={checked}
            aria-label={checked ? `Undo done: ${t.task}` : `Check off ${t.task}`}
            title={checked ? 'Undo' : 'Done'}
            onClick={() => act.toggle(t)}
          >
            <Icon d="M5 12.5l4.5 4.5L19 7.5" />
          </button>}
          <RowMenu t={t} act={act} checked={checked} />
        </div>
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
  collapsible
}: {
  sections: Section[];
  grouped: Record<Section, Task[]>;
  steps: Map<string, Task[]>;
  projects: Project[];
  today: Date;
  act: Actions;
  collapsible?: boolean;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ done: true, monthly: true, annual: true, deleted: true });
  return (
    <div className="task-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th className="col-project">Project</th>
            <th className="col-desc">Description</th>
            <th className="col-task">Task</th>
            <th className="col-center">Status</th>
            <th className="col-center">Info</th>
            <th className="col-center">Start</th>
            <th className="col-center">Required</th>
            <th className="col-center">Time</th>
            <th className="col-center">Expense</th>
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

function useTaskEditor(p: EditorProps) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const isNew = !!editing && !p.tasks.some((t) => t.id === editing.id);
  const parent = editing?.parentId ? p.tasks.find((t) => t.id === editing.parentId) ?? null : null;
  const sheet = (
    <Sheet open={open} title={parent ? (isNew ? `Add a step to ${parent.task}` : 'Edit step') : isNew ? 'Add task' : 'Edit task'} onClose={() => setOpen(false)} wide>
      {editing && (
        <TaskForm
          key={editing.id}
          task={editing}
          isNew={isNew}
          isStep={!!editing.parentId}
          existingSteps={stepsByParent(p.tasks).get(editing.id) ?? []}
          descriptions={[...new Set(p.tasks.map((x) => x.description.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))}
          projects={p.projects}
          onCancel={() => setOpen(false)}
          onSave={async (t, newSteps) => {
            const base = p.tasks.reduce((m, x) => Math.max(m, x.sort + 1), 0);
            const kids = newSteps.filter((s) => s.trim()).map((s, i) => newStep(t, s, base + i));
            if (kids.length) await p.onSaveMany([t, ...kids]);
            else await p.onSave(t);
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
    addStep: (parentTask: Task) => {
      setEditing(newStep(parentTask, '', p.tasks.reduce((m, x) => Math.max(m, x.sort + 1), 0)));
      setOpen(true);
    }
  };
}

type PageProps = EditorProps & {
  onAddToCalendar: (t: Task) => void;
  onCreateLaunch: (t: Task) => void;
};

function useActions(p: PageProps, editor: ReturnType<typeof useTaskEditor>): Actions {
  return {
    toggle: (t) => p.onSave(toggleDone(t)),
    edit: editor.edit,
    addStep: editor.addStep,
    moveTo: (t, iso) => p.onSave({ ...t, endDate: iso, startDate: t.startDate && t.startDate > iso ? iso : t.startDate }),
    remove: (t) => p.onSave({ ...t, deletedAt: new Date().toISOString() }),
    restore: (t) => p.onSave({ ...t, deletedAt: null }),
    purge: (t) => p.onDelete(t.id),
    clear: (t) => p.onSave({ ...t, cleared: true }),
    toCalendar: p.onAddToCalendar,
    toLaunch: p.onCreateLaunch
  };
}

/** Launch Page: just Due today and the 3 key tasks. */
export function TasksPanel(p: PageProps & { onOpenAll: () => void }) {
  const editor = useTaskEditor(p);
  const act = useActions(p, editor);
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
      <TaskTable sections={['due', 'key']} grouped={grouped} steps={stepsByParent(p.tasks)} projects={p.projects} today={p.today} act={act} />
      {editor.sheet}
    </section>
  );
}

/** The Tasks page: the whole list, in the Launch Sheet's sections. */
export function TasksPage(p: PageProps & { onOpenProjects: () => void; onImport: (file: File) => void }) {
  const editor = useTaskEditor(p);
  const act = useActions(p, editor);
  const [view, setView] = useState<Section | null>(null);
  const grouped = groupTasks(p.tasks, p.today);
  const topLevel = Object.entries(grouped).reduce((n, [k, l]) => (k === 'deleted' ? n : n + l.length), 0);
  return (
    <section className="panel panel-tasks-page" aria-labelledby="h-tasks-page">
      <div className="panel-head">
        <h2 id="h-tasks-page" className="panel-title">
          Tasks
        </h2>
        <div className="panel-actions">
          <label className="icon-btn tool-btn import-btn" title="Import tasks (Launch Sheet file)">
            <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            <span className="sr-only">Import tasks</span>
            <input
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="icon-btn tool-btn" aria-label="Projects" title="Areas and projects" onClick={p.onOpenProjects}>
            <Icon d={FOLDER} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Add task" title="Add task" onClick={editor.add}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>
      <div className="area-filter" role="group" aria-label="Show">
        <button type="button" className="area-pill" aria-pressed={view === null} onClick={() => setView(null)}>
          All <span className="pill-count">{topLevel}</span>
        </button>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className="area-pill"
            aria-pressed={view === sec.id}
            title={sec.hint}
            onClick={() => setView(view === sec.id ? null : sec.id)}
          >
            {sec.pill ?? sec.title} <span className="pill-count">{grouped[sec.id].length}</span>
          </button>
        ))}
      </div>
      <TaskTable
        key={view ?? 'all'}
        sections={view ? [view] : SECTIONS.map((s) => s.id)}
        grouped={grouped}
        steps={stepsByParent(p.tasks)}
        projects={p.projects}
        today={p.today}
        act={act}
        collapsible={!view}
      />
      {editor.sheet}
    </section>
  );
}

function TaskForm({
  task,
  isNew,
  isStep,
  existingSteps,
  descriptions,
  projects,
  onSave,
  onDelete
}: {
  task: Task;
  isNew: boolean;
  isStep: boolean;
  existingSteps: Task[];
  descriptions: string[];
  projects: Project[];
  onCancel?: () => void;
  /** newSteps: names typed into the Steps list, created underneath on save. */
  onSave: (t: Task, newSteps: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Task>(task);
  const [steps, setSteps] = useState<string[]>([]);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setD((x) => ({ ...x, [k]: v }));
  const recurring = d.status === 'MTH RCR' || d.status === 'ANN RCR';
  const tree = projectTree(projects);
  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.task.trim()) return;
        const endDate = d.endDate && d.startDate && d.endDate < d.startDate ? d.startDate : d.endDate;
        const repeatRule = recurring ? d.repeatRule ?? (d.status === 'ANN RCR' ? '01-01' : '1') : d.repeatRule;
        await onSave({ ...d, task: d.task.trim(), description: d.description.trim(), endDate, repeatRule }, steps);
      }}
    >
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
          <span>Status</span>
          <select value={d.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Task</span>
        <input required value={d.task} onChange={(e) => set('task', e.target.value)} placeholder="Relocate Brand Shop" />
      </label>
      {!isStep && (
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
      )}
      <label className="field">
        <span>Description</span>
        <input
          list="task-descriptions"
          autoComplete="off"
          value={d.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="New, or pick one you've used"
        />
        <datalist id="task-descriptions">
          {descriptions.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <div className="time-grid">
        <label className="field">
          <span>Info (link or phone)</span>
          <input value={d.link} onChange={(e) => set('link', e.target.value)} placeholder="https://www.rentfaster.ca or 780-555-0123" />
        </label>
        <label className="field">
          <span>Info name</span>
          <input value={d.linkLabel} onChange={(e) => set('linkLabel', e.target.value)} placeholder="RENTFASTER" />
        </label>
      </div>
      {recurring ? (
        <RepeatPicker annual={d.status === 'ANN RCR'} rule={d.repeatRule} onChange={(r) => set('repeatRule', r)} />
      ) : (
        <div className="time-grid">
          <label className="field">
            <span>Start</span>
            <input type="date" value={d.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
          </label>
          <label className="field">
            <span>Date required</span>
            <input type="date" min={d.startDate ?? undefined} value={d.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
          </label>
        </div>
      )}
      <div className="time-grid">
        <label className="field">
          <span>Time (optional)</span>
          <input type="time" value={d.atTime ?? ''} onChange={(e) => set('atTime', e.target.value || null)} />
        </label>
        <label className="field">
          <span>Expense (optional)</span>
          <div className="expense-row">
            <input
              inputMode="decimal"
              aria-label="Amount"
              value={splitExpense(d.expense).amount}
              onChange={(e) => set('expense', joinExpense(e.target.value, splitExpense(d.expense).currency))}
              placeholder="1140"
            />
            <select aria-label="Currency" value={splitExpense(d.expense).currency} onChange={(e) => set('expense', joinExpense(splitExpense(d.expense).amount, e.target.value))}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <input value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      <FormActions formId={formId} saveDisabled={!d.task.trim()} onDelete={!isNew ? () => onDelete(task.id) : undefined} deleteLabel={task.task} />
    </form>
  );
}

// ---------- Repeat picker: "on the 5th" or "every 2nd Tuesday"; annual = month + day ----------

const ORD = ['1ST', '2ND', '3RD', '4TH', 'LAST'];
const ORD_LABEL: Record<string, string> = { '1ST': '1st', '2ND': '2nd', '3RD': '3rd', '4TH': '4th', LAST: 'Last' };
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_LABEL: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nth = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/** "1st THURSDAY", "17th", "Mar 15" for the table. */
export function describeRule(t: Task) {
  const r = (t.repeatRule ?? '').trim().toUpperCase();
  if (!r) return '';
  if (t.status === 'ANN RCR') {
    const m = r.match(/^(\d{1,2})-(\d{1,2})$/);
    return m ? `${MONTHS[Number(m[1]) - 1] ?? ''} ${Number(m[2])}` : r;
  }
  if (/^\d{1,2}$/.test(r)) return nth(Number(r));
  const m = r.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  return m ? `${ORD_LABEL[m[1]]} ${WEEKDAY_LABEL[m[2]]?.toUpperCase() ?? m[2]}` : r;
}

function RepeatPicker({ annual, rule, onChange }: { annual: boolean; rule: string | null; onChange: (r: string | null) => void }) {
  const r = (rule ?? '').trim().toUpperCase();
  if (annual) {
    const m = r.match(/^(\d{1,2})-(\d{1,2})$/);
    const month = m ? Number(m[1]) : 1;
    const day = m ? Number(m[2]) : 1;
    const put = (mo: number, dy: number) => onChange(`${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`);
    return (
      <fieldset className="field">
        <legend>Every year on</legend>
        <div className="time-grid">
          <select aria-label="Month" value={month} onChange={(e) => put(Number(e.target.value), day)}>
            {MONTHS.map((mo, i) => (
              <option key={mo} value={i + 1}>
                {mo}
              </option>
            ))}
          </select>
          <select aria-label="Day" value={day} onChange={(e) => put(month, Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
    );
  }
  const wk = r.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  const mode: 'day' | 'weekday' = wk ? 'weekday' : 'day';
  const dayNum = /^\d{1,2}$/.test(r) ? Number(r) : 1;
  const ord = wk ? wk[1] : '1ST';
  const dow = wk ? wk[2] : 'MON';
  return (
    <fieldset className="field">
      <legend>Every month</legend>
      <div className="choice-row">
        <label className="choice">
          <input type="radio" name="repeat-mode" checked={mode === 'day'} onChange={() => onChange(String(dayNum))} />
          <span>On a date</span>
        </label>
        <label className="choice">
          <input type="radio" name="repeat-mode" checked={mode === 'weekday'} onChange={() => onChange(`${ord} ${dow}`)} />
          <span>On a weekday</span>
        </label>
      </div>
      {mode === 'day' ? (
        <div className="time-grid repeat-row">
          <select aria-label="Day of the month" value={dayNum} onChange={(e) => onChange(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                the {nth(i + 1)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="time-grid repeat-row">
          <select aria-label="Which week" value={ord} onChange={(e) => onChange(`${e.target.value} ${dow}`)}>
            {ORD.map((o) => (
              <option key={o} value={o}>
                {ORD_LABEL[o]}
              </option>
            ))}
          </select>
          <select aria-label="Weekday" value={dow} onChange={(e) => onChange(`${ord} ${e.target.value}`)}>
            {WEEKDAYS.map((w) => (
              <option key={w} value={w}>
                {WEEKDAY_LABEL[w]}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="field-hint">Days past the end of a short month land on its last day.</p>
    </fieldset>
  );
}
