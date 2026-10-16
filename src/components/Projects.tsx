import { useState, useId } from 'react';
import { FormActions, Sheet } from './Sheet';
import { projectTree, type Project } from '../lib/projects';
import type { GoogleCalendar } from '../lib/google';

type Props = {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  calendars: GoogleCalendar[];
  onSave: (p: Project) => Promise<void>;
  onDelete: (p: Project) => Promise<void>;
};

/** Areas and the projects nested under them, each with a colour and a Google calendar. */
export function ProjectsSheet({ open, onClose, projects, calendars, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<Project | null>(null);
  const tree = projectTree(projects);
  const calName = (id: string | null) => calendars.find((c) => c.id === id)?.summary ?? (id ? 'Google calendar' : null);

  const startNew = (parentId: string | null) =>
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      color: parentId ? projects.find((p) => p.id === parentId)?.color ?? '#06F9C2' : '#06F9C2',
      parentId,
      calendarId: null,
      sort: projects.length
    });

  return (
    <Sheet
      open={open}
      title={editing ? (projects.some((p) => p.id === editing.id) ? `Edit ${editing.name}` : 'Add project') : 'Areas and projects'}
      onClose={() => {
        if (editing) setEditing(null);
        else onClose();
      }}
      wide
    >
      {editing ? (
        <ProjectForm
          key={editing.id}
          project={editing}
          isNew={!projects.some((p) => p.id === editing.id)}
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
      ) : (
        <div className="project-list">
          {tree.map(({ area, children }) => (
            <div key={area.id} className="project-group">
              <button type="button" className="project-row project-area" onClick={() => setEditing(area)}>
                <span className="project-dot" style={{ background: area.color }} aria-hidden="true" />
                <span className="project-name">{area.name}</span>
                <span className="project-cal">{calName(area.calendarId) ?? 'No calendar linked'}</span>
              </button>
              {children.map((c) => (
                <button key={c.id} type="button" className="project-row project-child" onClick={() => setEditing(c)}>
                  <span className="project-dot" style={{ background: c.color }} aria-hidden="true" />
                  <span className="project-name">{c.name}</span>
                  <span className="project-cal">{calName(c.calendarId) ?? `Uses ${area.name}`}</span>
                </button>
              ))}
              <button type="button" className="link-btn link-btn-inline project-add-child" onClick={() => startNew(area.id)}>
                + Add under {area.name}
              </button>
            </div>
          ))}
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={() => startNew(null)}>
              + Add area
            </button>
          </div>
          {!calendars.length && <p className="field-hint">Connect Google Calendar on the Launch Page to link areas to your calendars.</p>}
        </div>
      )}
    </Sheet>
  );
}

function ProjectForm({
  project,
  isNew,
  projects,
  calendars,
  onSave,
  onDelete
}: {
  project: Project;
  isNew: boolean;
  projects: Project[];
  calendars: GoogleCalendar[];
  onCancel?: () => void;
  onSave: (p: Project) => Promise<void>;
  onDelete: (p: Project) => Promise<void>;
}) {
  const [d, setD] = useState<Project>(project);
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setD((x) => ({ ...x, [k]: v }));
  const hasChildren = projects.some((p) => p.parentId === project.id);
  const areas = projects.filter((p) => !p.parentId && p.id !== project.id);
  const formId = useId();
  return (
    <form id={formId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.name.trim()) return;
        await onSave({ ...d, name: d.name.trim() });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input required value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Renegade Training" />
      </label>
      <div className="time-grid">
        <label className="field">
          <span>Nested under</span>
          <select value={d.parentId ?? ''} disabled={hasChildren} onChange={(e) => set('parentId', e.target.value || null)}>
            <option value="">Nothing (it's an area)</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field swatch">
          <span>Colour</span>
          <input type="color" value={d.color} onChange={(e) => set('color', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Google calendar</span>
        <select value={d.calendarId ?? ''} onChange={(e) => set('calendarId', e.target.value || null)} disabled={!calendars.length}>
          <option value="">{d.parentId ? 'Same as its area' : 'None'}</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.summary ?? c.id}
            </option>
          ))}
        </select>
      </label>
      {!calendars.length && <p className="field-hint">Connect Google Calendar on the Launch Page to pick one.</p>}
      <FormActions formId={formId} saveDisabled={!d.name.trim()} onDelete={!isNew ? () => onDelete(project) : undefined} deleteLabel={project.name} />
    </form>
  );
}
