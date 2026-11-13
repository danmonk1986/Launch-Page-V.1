import { makeStore } from './store';

/** An area (top level) or a project nested under one. Each can add to its own Google calendar. */
export interface Project {
  id: string;
  name: string;
  color: string; // hex
  parentId: string | null;
  calendarId: string | null;
  sort: number;
  /** V20-165 (Dan, Nov 13): Settings › Projects. Personal or Business (a project under an area takes its area's). */
  kind?: ProjectKind;
  description?: string;
  /** What chips and pickers show ("LaunchPage" instead of "STARDVST APP SHOP › LaunchPage"). */
  shortName?: string;
  /** Archived projects leave the pickers but keep their history. */
  status?: ProjectStatus;
  link?: string;
}
export type ProjectKind = 'personal' | 'business';
export type ProjectStatus = 'active' | 'paused' | 'archived';

type Row = {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  calendar_id: string | null;
  sort: number;
  kind?: string | null;
  description?: string | null;
  short_name?: string | null;
  status?: string | null;
  link?: string | null;
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
  toRow: (p) => ({
    id: p.id, name: p.name, color: p.color, parent_id: p.parentId, calendar_id: p.calendarId, sort: p.sort,
    kind: p.kind ?? 'personal', description: p.description ?? '', short_name: p.shortName ?? '', status: p.status ?? 'active', link: p.link ?? ''
  }),
  fromRow: (r) => ({
    id: r.id, name: r.name, color: r.color, parentId: r.parent_id, calendarId: r.calendar_id, sort: r.sort,
    kind: r.kind === 'business' ? 'business' : 'personal',
    description: r.description ?? '',
    shortName: r.short_name ?? '',
    status: r.status === 'paused' || r.status === 'archived' ? r.status : 'active',
    link: r.link ?? ''
  })
});

/** V20-165: the name chips and pickers show: the short name, or the name without "STARDVST ". */
export const shortOf = (p: Project) => p.shortName?.trim() || p.name.replace(/^STARDVST\s+/i, '');
/** V20-165: a project's type is its area's. */
export const kindOf = (list: Project[], p: Project): ProjectKind => {
  const area = p.parentId ? list.find((x) => x.id === p.parentId) : null;
  return (area ?? p).kind ?? 'personal';
};
/** V20-165: what a picker offers: everything not archived (plus the one already picked). */
export const pickable = (list: Project[], keepId?: string | null) => list.filter((p) => p.status !== 'archived' || p.id === keepId);
/** V20-165: picker label: the short name if one is set, else "Area › Project". */
export function pickLabel(list: Project[], p: Project) {
  if (p.shortName?.trim()) return p.shortName.trim();
  const parent = p.parentId ? list.find((x) => x.id === p.parentId) : null;
  return parent ? `${parent.name} › ${p.name}` : p.name;
}

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

/**
 * The project a division name means (Records, Nov 1): the same name, or the name without the
 * "STARDVST " prefix (MWD → STARDVST MWD, APP SHOP → STARDVST APP SHOP), so its pill takes the
 * project's colour.
 */
export function projectForDivision(projects: Project[], division: string): Project | null {
  const d = division.trim().toUpperCase();
  if (!d) return null;
  const bare = (n: string) => n.trim().toUpperCase().replace(/^STARDVST\s+/, '');
  return projects.find((x) => x.name.trim().toUpperCase() === d) ?? projects.find((x) => bare(x.name) === bare(d)) ?? null;
}
