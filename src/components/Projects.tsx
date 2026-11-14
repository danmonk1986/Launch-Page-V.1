import { createContext, useContext, useEffect, useState } from 'react';

/** V20-166: the Settings header's Save submits this form when a project is open. */
export const PROJECT_FORM_ID = 'settings-project-form';

/** V20-167 (Dan, Nov 13): while a project is open, the Settings header becomes the card's: its title, Delete, Save
 *  and × (back to the list). The tabs and the day / night switch step aside. */
export type ProjectHead = { title: string; onBack: () => void; onDelete?: () => void; onEdit?: () => void } | null;
export const ProjectHeadContext = createContext<(h: ProjectHead) => void>(() => {});
import { kindOf, logsProductivity, projectTree, type Project, type ProjectKind, type ProjectStatus } from '../lib/projects';
import type { GoogleCalendar } from '../lib/google';
import type { Task } from '../lib/tasks';
import type { Launch, LaunchLog } from '../lib/rockets';
import { Icon } from './Tasks';

const PENCIL = 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4';

type Props = {
  projects: Project[];
  calendars: GoogleCalendar[];
  onSave: (p: Project) => Promise<void>;
  onDelete: (p: Project) => Promise<void>;
  /** V20-174: for the project dashboard. */
  tasks?: Task[];
  launches?: Launch[];
  runs?: LaunchLog[];
};

const KINDS: { id: ProjectKind; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'business', label: 'Business' }
];
const STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'archived', label: 'Archived' }
];

/**
 * V20-165 (Dan, Nov 13): Settings › Projects in the style of the rest of Settings. PERSONAL (teal, with + on the
 * right) lists areas with their projects under them; BUSINESS shows once a project is set to Business. Archived ones
 * fold away at the bottom. The add / edit card: Project | Parent, Description, Type | Colour, Short name | Status,
 * Calendar | Link. (V20-111: lives in Settings › Projects; it was its own sheet from the Tasks page.)
 */
export function ProjectsManager({ projects, calendars, onSave, onDelete, tasks = [], launches = [], runs = [] }: Props) {
  const [editing, setEditing] = useState<Project | null>(null);
  // V20-174 (Dan, Nov 13): tapping a project opens its dashboard; Edit is its own button.
  const [viewing, setViewing] = useState<Project | null>(null);
  const calName = (id: string | null) => calendars.find((c) => c.id === id)?.summary ?? null;

  const startNew = (kind: ProjectKind) =>
    setEditing({ id: crypto.randomUUID(), name: '', color: '#06F9C2', parentId: null, calendarId: null, sort: projects.length, kind, status: 'active', description: '', shortName: '', link: '' });

  const setHead = useContext(ProjectHeadContext);
  const editingIsNew = !!editing && !projects.some((p) => p.id === editing.id);
  useEffect(() => {
    if (!editing) {
      const v = viewing ? projects.find((p) => p.id === viewing.id) ?? null : null;
      setHead(v ? { title: v.name, onBack: () => setViewing(null), onEdit: () => setEditing(v) } : null);
      return;
    }
    setHead({
      title: editingIsNew ? 'Add project' : `Edit ${editing.name}`,
      onBack: () => setEditing(null),
      onDelete: editingIsNew
        ? undefined
        : async () => {
            await onDelete(editing);
            setEditing(null);
          }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, editingIsNew, viewing?.id, projects]);
  useEffect(() => () => setHead(null), [setHead]);

  if (editing) {
    const isNew = editingIsNew;
    return (
      <div className="projects-manager">
        <ProjectForm
          key={editing.id}
          project={editing}
          isNew={isNew}
          projects={projects}
          calendars={calendars}
          onSave={async (p) => {
            await onSave(p);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  if (viewing) {
    const v = projects.find((p) => p.id === viewing.id);
    if (v) return <ProjectDashboard project={v} projects={projects} tasks={tasks} launches={launches} runs={runs} calendar={calName(v.calendarId)} />;
  }

  const live = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');
  const tree = projectTree(live);
  const hasBusiness = tree.some(({ area }) => kindOf(projects, area) === 'business');
  const sections = KINDS.filter((k) => k.id === 'personal' || hasBusiness);

  // V20-174: the switch is on = in use; off = archived (out of the task and launch pickers, history kept).
  const toggle = (p: Project, on: boolean) => void onSave({ ...p, status: on ? 'active' : 'archived' });
  const row = (p: Project, child: boolean) => (
    <div key={p.id} className={`project-line ${child ? 'project-child' : 'project-area'}${p.status === 'archived' ? ' is-off' : ''}`}>
      <button type="button" className="project-row" onClick={() => setViewing(p)} title={`Open ${p.name}`}>
        <span className="project-dot" style={{ background: p.color }} aria-hidden="true" />
        <span className="project-name">
          {p.name}
          {p.status === 'paused' && <span className="project-badge">Paused</span>}
        </span>
        <span className="project-cal">{calName(p.calendarId) ?? ''}</span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={p.status !== 'archived'}
        aria-label={`${p.name} ${p.status === 'archived' ? 'off (archived)' : 'on'}`}
        className={`module-switch${p.status !== 'archived' ? ' is-on' : ''}`}
        onClick={() => toggle(p, p.status === 'archived')}
      >
        <span />
      </button>
      {/* V20-194 (Dan, Nov 14): Edit is an icon, the same size as the + above it. */}
      <button type="button" className="quick-btn project-edit" aria-label={`Edit ${p.name}`} title={`Edit ${p.name}`} onClick={() => setEditing(p)}>
        <Icon d={PENCIL} />
      </button>
    </div>
  );

  return (
    <div className="projects-manager">
      {sections.map((k, i) => (
        <div key={k.id} className="project-section">
          <div className={`settings-section-head${i ? ' settings-section-gap' : ''}`}>
            <h3 className="timed-title settings-section">{k.label}</h3>
            {/* V20-193 (Dan, Nov 14): "Active" sits beside the + on the top section's line, over the switches. */}
            <span className="project-head-right">
              {i === 0 && <span className="project-col-label">Active</span>}
              {/* V20-206 (Dan, Nov 14): one + at the top; a new project starts as Business (Type can change it). */}
              {i === 0 && (
                <span className="project-plus-slot">
                  <button type="button" className="quick-btn project-plus" aria-label="Add a project" title="Add project" onClick={() => startNew('business')}>
                    +
                  </button>
                </span>
              )}
            </span>
          </div>
          <div className="project-list">
            {tree
              .filter(({ area }) => kindOf(projects, area) === k.id)
              .map(({ area, children }) => (
                <div key={area.id} className="project-group">
                  {row(area, false)}
                  {children.map((c) => row(c, true))}
                </div>
              ))}
          </div>
        </div>
      ))}
      {/* V20-176 (Dan, Nov 13): ARCHIVED is a section like Personal and Business; switch one on to bring it back. */}
      {archived.length > 0 && (
        <div className="project-section">
          <div className="settings-section-head settings-section-gap">
            <h3 className="timed-title settings-section">Archived</h3>
          </div>
          <div className="project-list">{archived.map((p) => row(p, !!p.parentId))}</div>
        </div>
      )}
    </div>
  );
}

function ProjectForm({
  project,
  projects,
  calendars,
  onSave
}: {
  project: Project;
  isNew: boolean;
  projects: Project[];
  calendars: GoogleCalendar[];
  onSave: (p: Project) => Promise<void>;
}) {
  const [d, setD] = useState<Project>(project);
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setD((x) => ({ ...x, [k]: v }));
  const hasChildren = projects.some((p) => p.parentId === project.id);
  const areas = projects.filter((p) => !p.parentId && p.id !== project.id && p.status !== 'archived');
  const parent = d.parentId ? projects.find((p) => p.id === d.parentId) : null;
  const logOn = logsProductivity(projects, { ...d, kind: parent ? parent.kind ?? 'personal' : d.kind ?? 'personal' });
  return (
    <form
      id={PROJECT_FORM_ID}
      className="project-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        // A project under an area takes its area's type.
        await onSave({ ...d, name: d.name.trim(), shortName: d.shortName?.trim() ?? '', link: d.link?.trim() ?? '', kind: parent ? parent.kind ?? 'personal' : d.kind ?? 'personal' });
      }}
    >
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Project</span>
          <input required value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Renegade Training" />
        </label>
        <label className="field">
          <span className="field-label">Parent</span>
          <select
            value={d.parentId ?? ''}
            disabled={hasChildren}
            onChange={(e) => {
              // V20-166: a project takes its parent's colour when you pick the parent.
              const pid = e.target.value || null;
              const par = pid ? projects.find((p) => p.id === pid) : null;
              setD((x) => ({ ...x, parentId: pid, ...(par ? { color: par.color } : {}) }));
            }}
          >
            <option value="">None (it's an area)</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Description</span>
        <input value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="What this project is for" />
      </label>
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Type</span>
          <select value={parent ? parent.kind ?? 'personal' : d.kind ?? 'personal'} disabled={!!parent} onChange={(e) => set('kind', e.target.value as ProjectKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <div className="project-colour-log">
          <label className="field">
            <span className="field-label">Colour</span>
            <span className="project-colour">
              <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} aria-label="Colour" />
              <code>{d.color.toLowerCase()}</code>
            </span>
          </label>
          {/* V20-181 (Dan, Nov 14): Log Productivity, beside Colour. Off = the time still logs, as personal time. */}
          <div className="field">
            <span className="field-label">Log Productivity</span>
            <span className="project-colour">
              <button
                type="button"
                role="switch"
                aria-checked={logOn}
                aria-label={`Log Productivity ${logOn ? 'on' : 'off'}`}
                className={`module-switch${logOn ? ' is-on' : ''}`}
                onClick={() => set('logProductivity', !logOn)}
              >
                <span />
              </button>
            </span>
          </div>
        </div>
      </div>
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Short name</span>
          <input value={d.shortName ?? ''} onChange={(e) => set('shortName', e.target.value)} placeholder={d.name.replace(/^STARDVST\s+/i, '') || 'Shown on chips and pickers'} />
        </label>
        <label className="field">
          <span className="field-label">Status</span>
          <select value={d.status ?? 'active'} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Calendar</span>
          <select value={d.calendarId ?? ''} onChange={(e) => set('calendarId', e.target.value || null)} disabled={!calendars.length}>
            <option value="">{d.parentId ? 'Same as its area' : 'None'}</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary ?? c.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Link</span>
          <input type="url" value={d.link ?? ''} onChange={(e) => set('link', e.target.value)} placeholder="https://" />
        </label>
      </div>
      {d.parentId && <p className="field-hint">A project under an area takes its area's type.</p>}
      {d.status === 'archived' && <p className="field-hint">Archived: it leaves the project pickers, and its tasks, launches and time stay in your history.</p>}
    </form>
  );
}

/**
 * V20-174 (Dan, Nov 13): everything for one project. Counts its own projects too when it's an area. Hours only
 * start Nov 12, when runs began saving their project.
 */
function ProjectDashboard({ project, projects, tasks, launches, runs, calendar }: { project: Project; projects: Project[]; tasks: Task[]; launches: Launch[]; runs: LaunchLog[]; calendar: string | null }) {
  const ids = new Set([project.id, ...projects.filter((p) => p.parentId === project.id).map((p) => p.id)]);
  const mine = (id?: string | null) => !!id && ids.has(id);
  const liveTasks = tasks.filter((t) => !t.deletedAt && !t.parentId && mine(t.projectId));
  const open = liveTasks.filter((t) => !t.done).sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999'));
  const doneTasks = liveTasks.filter((t) => t.done);
  const myLaunches = launches.filter((l) => mine(l.projectId) && l.active !== false).sort((a, b) => a.atTime.localeCompare(b.atTime));
  const myRuns = runs.filter((g) => mine(g.projectId)).sort((a, b) => b.day.localeCompare(a.day));
  const doneRuns = myRuns.filter((g) => g.outcome === 'done');
  const counted = myRuns.filter((g) => g.outcome !== 'cleared');
  const minutes = doneRuns.reduce((s, g) => s + (g.timeSource && g.timeSource !== 'none' ? g.loggedMin ?? 0 : 0), 0);
  const parent = project.parentId ? projects.find((p) => p.id === project.parentId) : null;
  const subs = projects.filter((p) => p.parentId === project.id);
  const fmtDay = (d?: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
  const card = (label: string, value: string, sub: string) => (
    <div className="pd-card">
      <span className="pd-label">{label}</span>
      <span className="pd-num">{value}</span>
      <span className="pd-sub">{sub}</span>
    </div>
  );
  return (
    <div className="project-dash">
      <p className="pd-meta">
        <span className="project-dot" style={{ background: project.color }} aria-hidden="true" />
        {project.kind === 'business' || parent?.kind === 'business' ? 'Business' : 'Personal'}
        {' · '}
        <span className="project-badge">{logsProductivity(projects, project) ? 'Productivity' : 'Personal time'}</span>
        {parent ? ` · under ${parent.name}` : subs.length ? ` · ${subs.length} project${subs.length === 1 ? '' : 's'} under it` : ''}
        {project.status === 'paused' ? ' · Paused' : project.status === 'archived' ? ' · Archived' : ''}
        {calendar ? ` · ${calendar}` : ''}
        {project.link ? (
          <>
            {' · '}
            <a href={project.link} target="_blank" rel="noreferrer">
              Link
            </a>
          </>
        ) : null}
      </p>
      {project.description && <p className="field-hint">{project.description}</p>}
      <div className="pd-cards">
        {card('Hours logged', (minutes / 60).toFixed(1), `${doneRuns.length} launches done`)}
        {card('Done rate', counted.length ? `${Math.round((doneRuns.length / counted.length) * 100)}%` : '—', `${counted.length} runs`)}
        {card('Open tasks', String(open.length), `${doneTasks.length} done`)}
        {card('Timed launches', String(myLaunches.length), 'scheduled')}
      </div>
      <h3 className="timed-title settings-section settings-section-gap">Open tasks</h3>
      {open.length ? (
        <ul className="pd-list">
          {open.map((t) => (
            <li key={t.id}>
              <span className="pd-name">{(t.task || t.description).toUpperCase()}</span>
              <span className="pd-dim">{t.task && t.description ? t.description : ''}</span>
              <span className="pd-when">{fmtDay(t.endDate)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No open tasks.</p>
      )}
      <h3 className="timed-title settings-section settings-section-gap">Timed launches</h3>
      {myLaunches.length ? (
        <ul className="pd-list">
          {myLaunches.map((l) => (
            <li key={l.id}>
              <span className="pd-name">{l.title}</span>
              <span className="pd-dim">{l.minutes} min</span>
              <span className="pd-when">{l.atTime}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No timed launches for this project.</p>
      )}
      <h3 className="timed-title settings-section settings-section-gap">Recent runs</h3>
      {myRuns.length ? (
        <ul className="pd-list">
          {myRuns.slice(0, 12).map((g) => (
            <li key={g.id}>
              <span className="pd-name">{g.title}</span>
              <span className="pd-dim">{g.outcome === 'done' ? (g.loggedMin != null && g.timeSource !== 'none' ? `${g.loggedMin} min` : 'done') : g.outcome}</span>
              <span className="pd-when">{fmtDay(g.day)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No runs yet. Runs save their project from Nov 12 on.</p>
      )}
    </div>
  );
}
