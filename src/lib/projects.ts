import { makeStore } from './store';

/** An area (top level) or a project nested under one. Each can add to its own Google calendar. */
export interface Project {
  id: string;
  name: string;
  color: string; // hex
  parentId: string | null;
  calendarId: string | null;
  sort: number;
}

type Row = {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  calendar_id: string | null;
  sort: number;
};

/** Dan's areas, from his Google calendars and the Launch Sheet, in pastel neons. */
export function seedProjects(): Project[] {
  const list: Project[] = [];
  let sort = 0;
  const add = (name: string, color: string, parentId: string | null = null) => {
    const p: Project = { id: crypto.randomUUID(), name, color, parentId, calendarId: null, sort: sort++ };
    list.push(p);
    return p.id;
  };
  add('NORTH STAR', '#06F9C2');
  add('DANMONK26', '#B794FF');
  add('HEALTH+WELLNESS', '#FF8FAB');
  const fntsy = add('FNTSY LVNG', '#FF9F68');
  add('Travel+Adventure', '#FFB38A', fntsy);
  const app = add('STARDVST APP SHOP', '#9DFF8A');
  add('StreamVU', '#7CF2B0', app);
  add('LaunchPage', '#06F9C2', app);
  add('Zaptor', '#C3F73A', app);
  add('STARDVST BRAND SHOP', '#7FDBFF');
  add('STARDVST MWD', '#FFE066');
  add('STARDVST LTD', '#C8C6C6');
  return list;
}

export const projectStore = makeStore<Project, Row>({
  table: 'projects',
  localKey: 'launchpage.projects.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0008_projects_tasks.sql',
  seed: seedProjects,
  toRow: (p) => ({ id: p.id, name: p.name, color: p.color, parent_id: p.parentId, calendar_id: p.calendarId, sort: p.sort }),
  fromRow: (r) => ({ id: r.id, name: r.name, color: r.color, parentId: r.parent_id, calendarId: r.calendar_id, sort: r.sort })
});

/** Areas with their projects underneath, in order. */
export function projectTree(list: Project[]) {
  const bySort = (a: Project, b: Project) => a.sort - b.sort;
  const ids = new Set(list.map((p) => p.id));
  const tops = list.filter((p) => !p.parentId || !ids.has(p.parentId)).sort(bySort);
  return tops.map((area) => ({ area, children: list.filter((p) => p.parentId === area.id).sort(bySort) }));
}

/** "STARDVST APP SHOP › LaunchPage" */
export function projectLabel(list: Project[], id: string | null) {
  const p = list.find((x) => x.id === id);
  if (!p) return '';
  const parent = p.parentId ? list.find((x) => x.id === p.parentId) : null;
  return parent ? `${parent.name} › ${p.name}` : p.name;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Calendar names that don't match their area word for word. */
const CALENDAR_HINTS: Record<string, string[]> = {
  northstar: ['theme'],
  launchpage: ['launch'],
  streamvu: ['streameq'],
  fntsylvng: ['fntsylvng', 'fantasyliving']
};

/** Which project a Google calendar belongs to, by name, for linking them up the first time. */
export function matchCalendar(projects: Project[], calendarName: string): Project | null {
  const c = norm(calendarName);
  return (
    projects.find((p) => norm(p.name) === c) ??
    projects.find((p) => (CALENDAR_HINTS[norm(p.name)] ?? []).includes(c)) ??
    null
  );
}

/** The colour for events from a Google calendar: the linked project's colour, if any. */
export function colorForCalendar(projects: Project[], calendarId: string) {
  return projects.find((p) => p.calendarId === calendarId)?.color ?? null;
}
