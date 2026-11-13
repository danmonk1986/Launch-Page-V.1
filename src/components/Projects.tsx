import { useState, useId } from 'react';
import { FormActions } from './Sheet';
import { kindOf, projectTree, type Project, type ProjectKind, type ProjectStatus } from '../lib/projects';
import type { GoogleCalendar } from '../lib/google';

type Props = {
  projects: Project[];
  calendars: GoogleCalendar[];
  onSave: (p: Project) => Promise<void>;
  onDelete: (p: Project) => Promise<void>;
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
export function ProjectsManager({ projects, calendars, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const calName = (id: string | null) => calendars.find((c) => c.id === id)?.summary ?? (id ? 'Google calendar' : null);

  const startNew = (kind: ProjectKind) =>
    setEditing({ id: crypto.randomUUID(), name: '', color: '#06F9C2', parentId: null, calendarId: null, sort: projects.length, kind, status: 'active', description: '', shortName: '', link: '' });

  if (editing) {
    const isNew = !projects.some((p) => p.id === editing.id);
    return (
      <div className="projects-manager">
        <h3 className="timed-title settings-section">{isNew ? 'Add project' : `Edit ${editing.name}`}</h3>
        <ProjectForm
          key={editing.id}
          project={editing}
          isNew={isNew}
          projects={projects}
          calendars={calendars}
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            await onSave(p);
            setEditing(null);
          }}
          onDelete={async (p) => {
            await onDelete(p);
            setEditing(null);
          }}
        />
      </div>
    );
  }

  const live = projects.filter((p) => p.status !== 'archived');
  const archived = projects.filter((p) => p.status === 'archived');
  const tree = projectTree(live);
  const hasBusiness = tree.some(({ area }) => kindOf(projects, area) === 'business');
  const sections = KINDS.filter((k) => k.id === 'personal' || hasBusiness);

  const row = (p: Project, child: boolean, areaName?: string) => (
    <button key={p.id} type="button" className={`project-row ${child ? 'project-child' : 'project-area'}`} onClick={() => setEditing(p)}>
      <span className="project-dot" style={{ background: p.color }} aria-hidden="true" />
      <span className="project-name">
        {p.name}
        {p.status === 'paused' && <span className="project-badge">Paused</span>}
      </span>
      <span className="project-cal">{calName(p.calendarId) ?? (child ? `Uses ${areaName}` : '')}</span>
    </button>
  );

  return (
    <div className="projects-manager">
      {sections.map((k, i) => (
        <div key={k.id} className="project-section">
          <div className={`settings-section-head${i ? ' settings-section-gap' : ''}`}>
            <h3 className="timed-title settings-section">{k.label}</h3>
            <button type="button" className="icon-btn tool-btn project-plus" aria-label={`Add a ${k.label.toLowerCase()} project`} title="Add project" onClick={() => startNew(k.id)}>
              +
            </button>
          </div>
          <div className="project-list">
            {tree
              .filter(({ area }) => kindOf(projects, area) === k.id)
              .map(({ area, children }) => (
                <div key={area.id} className="project-group">
                  {row(area, false)}
                  {children.map((c) => row(c, true, area.name))}
                </div>
              ))}
          </div>
        </div>
      ))}
      {archived.length > 0 && (
        <div className="project-section settings-section-gap">
          <button type="button" className="link-btn link-btn-inline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : `Archived (${archived.length})`}
          </button>
          {showArchived && <div className="project-list project-archived">{archived.map((p) => row(p, false))}</div>}
        </div>
      )}
      {!calendars.length && <p className="field-hint">Connect Google Calendar on the Launch Page to link projects to your calendars.</p>}
    </div>
  );
}

function ProjectForm({
  project,
  isNew,
  projects,
  calendars,
  onCancel,
  onSave,
  onDelete
}: {
  project: Project;
  isNew: boolean;
  projects: Project[];
  calendars: GoogleCalendar[];
  onCancel: () => void;
  onSave: (p: Project) => Promise<void>;
  onDelete: (p: Project) => Promise<void>;
}) {
  const [d, setD] = useState<Project>(project);
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setD((x) => ({ ...x, [k]: v }));
  const hasChildren = projects.some((p) => p.parentId === project.id);
  const areas = projects.filter((p) => !p.parentId && p.id !== project.id && p.status !== 'archived');
  const parent = d.parentId ? projects.find((p) => p.id === d.parentId) : null;
  const formId = useId();
  return (
    <form
      id={formId}
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
          <select value={d.parentId ?? ''} disabled={hasChildren} onChange={(e) => set('parentId', e.target.value || null)}>
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
        <label className="field">
          <span className="field-label">Colour</span>
          <span className="project-colour">
            <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} aria-label="Colour" />
            <code>{d.color.toLowerCase()}</code>
          </span>
        </label>
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
      <div className="project-form-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Back
        </button>
        <FormActions formId={formId} saveDisabled={!d.name.trim()} onDelete={!isNew ? () => onDelete(project) : undefined} deleteLabel={project.name} />
      </div>
    </form>
  );
}
