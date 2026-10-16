import { useState } from 'react';
import { Sheet } from './Sheet';
import { formatMinutes, toMinutes } from '../lib/routines';
import { normalizeUrl } from '../lib/launchers';
import { projectLabel, projectTree, type Project } from '../lib/projects';
import {
  doneToday,
  dueBadge,
  groupTasks,
  isRecurring,
  newTask,
  SECTIONS,
  STATUS_LABEL,
  STATUSES,
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

function TaskRows({
  list,
  projects,
  today,
  onToggle,
  onEdit,
  onTomorrow,
  onClear
}: {
  list: Task[];
  projects: Project[];
  today: Date;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onTomorrow: (t: Task) => void;
  onClear: (t: Task) => void;
}) {
  return (
    <>
      {list.map((t) => {
        const badge = dueBadge(t, today);
        const checked = isRecurring(t) ? doneToday(t, today) : t.done;
        return (
          <tr key={t.id} className={`task-row${checked ? ' is-done' : ''}`}>
            <td className="col-project">
              <ProjectChip projects={projects} id={t.projectId} />
            </td>
            <td className="col-desc">{t.description}</td>
            <td className="col-task">
              <button type="button" className="task-name" onClick={() => onEdit(t)}>
                {t.task}
              </button>
            </td>
            <td className="col-status">
              <span className={`status status-${(badge ?? t.status).replace(/\s+/g, '-').toLowerCase()}`}>{badge ?? t.status}</span>
            </td>
            <td className="col-link">
              {t.link ? (
                <a href={normalizeUrl(t.link)} target="_blank" rel="noopener noreferrer">
                  {t.linkLabel || 'Open'}
                </a>
              ) : (
                t.linkLabel
              )}
            </td>
            <td className="col-date">{isRecurring(t) ? t.repeatRule ?? '' : shortDate(t.startDate)}</td>
            <td className="col-date">{isRecurring(t) ? '' : shortDate(t.endDate)}</td>
            <td className="col-time">{t.atTime ? formatMinutes(toMinutes(t.atTime)) : ''}</td>
            <td className="col-actions">
              <div className="timed-quick">
                <button
                  type="button"
                  className="quick-btn quick-done task-quick"
                  aria-pressed={checked}
                  aria-label={checked ? `Undo done: ${t.task}` : `Check off ${t.task}`}
                  title={checked ? 'Undo' : 'Done'}
                  onClick={() => onToggle(t)}
                >
                  <Icon d="M5 12.5l4.5 4.5L19 7.5" />
                </button>
                {checked && !isRecurring(t) ? (
                  <button type="button" className="quick-btn quick-skip task-quick" aria-label={`Clear ${t.task} from Done`} title="Clear from Done" onClick={() => onClear(t)}>
                    <Icon d="M6 6l12 12M18 6L6 18" />
                  </button>
                ) : !checked && !isRecurring(t) ? (
                  <button type="button" className="quick-btn quick-skip task-quick" aria-label={`Move ${t.task} to tomorrow`} title="Move to tomorrow" onClick={() => onTomorrow(t)}>
                    <Icon d="M6 6l12 12M18 6L6 18" />
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function TaskTable({
  sections,
  grouped,
  projects,
  today,
  onToggle,
  onEdit,
  onTomorrow,
  onClear,
  collapsible
}: {
  sections: Section[];
  grouped: Record<Section, Task[]>;
  projects: Project[];
  today: Date;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onTomorrow: (t: Task) => void;
  onClear: (t: Task) => void;
  collapsible?: boolean;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ done: true, monthly: true, annual: true });
  return (
    <div className="task-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Description</th>
            <th>Task</th>
            <th>Status</th>
            <th>Link</th>
            <th>Start</th>
            <th>Required</th>
            <th>Time</th>
            <th className="col-actions" aria-label="Done or move" />
          </tr>
        </thead>
        {sections.map((id) => {
          const s = SECTIONS.find((x) => x.id === id)!;
          const rows = grouped[id];
          const shut = collapsible && closed[id];
          if (collapsible && !rows.length && id !== 'due' && id !== 'key') return null;
          return (
            <tbody key={id}>
              <tr className="task-section">
                <th colSpan={9} scope="rowgroup">
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
                  <td colSpan={9} className="task-empty">
                    {id === 'due' ? 'Nothing due. Nice.' : id === 'key' ? 'Set a task to THREE to make it one of your 3 key tasks.' : 'Nothing here.'}
                  </td>
                </tr>
              )}
              {!shut && (
                <TaskRows list={rows} projects={projects} today={today} onToggle={onToggle} onEdit={onEdit} onTomorrow={onTomorrow} onClear={onClear} />
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function useTaskEditor(p: Common) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [open, setOpen] = useState(false);
  const sheet = (
    <Sheet open={open} title={editing && p.tasks.some((t) => t.id === editing.id) ? 'Edit task' : 'Add task'} onClose={() => setOpen(false)} wide>
      {editing && (
        <TaskForm
          key={editing.id}
          task={editing}
          isNew={!p.tasks.some((t) => t.id === editing.id)}
          projects={p.projects}
          onCancel={() => setOpen(false)}
          onSave={async (t) => {
            await p.onSave(t);
            setOpen(false);
          }}
          onDelete={async (id) => {
            await p.onDelete(id);
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
    }
  };
}

/** Launch Page: just Due today and the 3 key tasks. */
export function TasksPanel(p: Common & { onOpenAll: () => void }) {
  const editor = useTaskEditor(p);
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
      <TaskTable
        sections={['due', 'key']}
        grouped={grouped}
        projects={p.projects}
        today={p.today}
        onToggle={(t) => p.onSave(toggleDone(t))}
        onEdit={editor.edit}
        onTomorrow={(t) => p.onSave(toTomorrow(t))}
        onClear={(t) => p.onSave({ ...t, cleared: true })}
      />
      {editor.sheet}
    </section>
  );
}

/** The Tasks page: the whole list, in the Launch Sheet's sections. */
export function TasksPage(p: Common & { onOpenProjects: () => void }) {
  const editor = useTaskEditor(p);
  const [area, setArea] = useState<string | null>(null);
  const tree = projectTree(p.projects);
  const inArea = (t: Task) => {
    if (!area) return true;
    const proj = p.projects.find((x) => x.id === t.projectId);
    return !!proj && (proj.id === area || proj.parentId === area);
  };
  const grouped = groupTasks(p.tasks.filter(inArea), p.today);
  return (
    <section className="panel panel-tasks-page" aria-labelledby="h-tasks-page">
      <div className="panel-head">
        <h2 id="h-tasks-page" className="panel-title">
          Tasks
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Projects" title="Areas and projects" onClick={p.onOpenProjects}>
            <Icon d={FOLDER} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Add task" title="Add task" onClick={editor.add}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>
      <div className="area-filter" role="group" aria-label="Show tasks for">
        <button type="button" className="area-pill" aria-pressed={!area} onClick={() => setArea(null)}>
          All
        </button>
        {tree.map(({ area: a }) => (
          <button
            key={a.id}
            type="button"
            className="area-pill"
            aria-pressed={area === a.id}
            style={{ ['--chip' as string]: a.color }}
            onClick={() => setArea(area === a.id ? null : a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>
      <TaskTable
        sections={SECTIONS.map((s) => s.id)}
        grouped={grouped}
        projects={p.projects}
        today={p.today}
        onToggle={(t) => p.onSave(toggleDone(t))}
        onEdit={editor.edit}
        onTomorrow={(t) => p.onSave(toTomorrow(t))}
        onClear={(t) => p.onSave({ ...t, cleared: true })}
        collapsible
      />
      {editor.sheet}
    </section>
  );
}

function TaskForm({
  task,
  isNew,
  projects,
  onCancel,
  onSave,
  onDelete
}: {
  task: Task;
  isNew: boolean;
  projects: Project[];
  onCancel: () => void;
  onSave: (t: Task) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<Task>(task);
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setD((x) => ({ ...x, [k]: v }));
  const recurring = d.status === 'MTH RCR' || d.status === 'ANN RCR';
  const tree = projectTree(projects);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.task.trim()) return;
        const endDate = d.endDate && d.startDate && d.endDate < d.startDate ? d.startDate : d.endDate;
        await onSave({ ...d, task: d.task.trim(), description: d.description.trim(), endDate });
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
      <label className="field">
        <span>Description</span>
        <input value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="New Location" />
      </label>
      <div className="time-grid">
        <label className="field">
          <span>Link</span>
          <input type="url" inputMode="url" value={d.link} onChange={(e) => set('link', e.target.value)} placeholder="https://www.rentfaster.ca" />
        </label>
        <label className="field">
          <span>Link name</span>
          <input value={d.linkLabel} onChange={(e) => set('linkLabel', e.target.value)} placeholder="RENTFASTER" />
        </label>
      </div>
      {recurring ? (
        <label className="field">
          <span>{d.status === 'ANN RCR' ? 'Every year on (MM-DD)' : 'Every month on'}</span>
          <input
            value={d.repeatRule ?? ''}
            onChange={(e) => set('repeatRule', e.target.value.toUpperCase() || null)}
            placeholder={d.status === 'ANN RCR' ? '03-15' : '17, 1st THU or LAST WED'}
          />
        </label>
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
          <input value={d.expense} onChange={(e) => set('expense', e.target.value)} placeholder="1140 USD" />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <input value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      <div className="sheet-actions sheet-actions-split">
        {!isNew ? (
          <button type="button" className="btn btn-quiet btn-danger" aria-label={`Delete ${task.task}`} onClick={() => onDelete(task.id)}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!d.task.trim()}>
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
