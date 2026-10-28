import { readRepeat, repeatOn } from './repeat';
import { makeStore } from './store';
import { isoDate } from './launchers';

/** Statuses from the Launch Sheet. DUE and OVERDUE are worked out from the date, not picked. */
/** MTH RCR / ANN RCR retired Oct 20: Repeat says how a task recurs (lib/repeat.ts). */
export const STATUSES = ['THREE', 'WIP', 'APPTS', 'ON DECK', 'PENDING'] as const;
export const OLD_REPEAT_STATUSES = ['MTH RCR', 'ANN RCR'];
export type Status = (typeof STATUSES)[number] | string;

export const STATUS_LABEL: Record<string, string> = {
  THREE: 'THREE (key task)',
  WIP: 'WIP',
  APPTS: 'APPOINTMENT',
  'ON DECK': 'ON DECK',
  PENDING: 'PENDING',
  'MTH RCR': 'MTH RCR (monthly)',
  'ANN RCR': 'ANN RCR (annual)'
};

export interface Task {
  id: string;
  /** Set on a step: the task it sits under. */
  parentId: string | null;
  projectId: string | null;
  description: string;
  task: string;
  status: Status;
  link: string;
  linkLabel: string;
  startDate: string | null;
  endDate: string | null; // date required
  atTime: string | null; // "HH:MM"
  /** Repeat (lib/repeat.ts): "W:1,4", "M:17", "Q1:15", "A:04-30"; older rows: a bare rule with status MTH/ANN RCR. */
  repeatRule: string | null;
  expense: string;
  notes: string;
  done: boolean;
  doneAt: string | null;
  /** Done and cleared off the Done list (kept for 26 Days and history). */
  cleared: boolean;
  /** Removed: sits in Recently deleted for 30 days, then goes for good. */
  deletedAt: string | null;
  googleEventId: string | null;
  launchId: string | null;
  /** The budget line this task pays (LP-030). Ticking it adds a line to Expenses. Column from 0031. */
  budgetLineId?: string | null;
  sort: number;
}

type Row = {
  id: string;
  parent_id?: string | null;
  project_id: string | null;
  description: string;
  task: string;
  status: string;
  link: string;
  link_label: string;
  start_date: string | null;
  end_date: string | null;
  at_time: string | null;
  repeat_rule: string | null;
  expense: string;
  notes: string;
  done: boolean;
  done_at: string | null;
  cleared: boolean;
  deleted_at?: string | null;
  google_event_id: string | null;
  launch_id: string | null;
  budget_line_id?: string | null;
  sort: number;
};

export const taskStore = makeStore<Task, Row>({
  table: 'tasks',
  localKey: 'launchpage.tasks.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0008_projects_tasks.sql',
  seed: () => [],
  latestScript: 'supabase/migrations/0031_budget_links.sql',
  // Before 0031 is run: save without the budget link (kept on this device until then).
  legacyRow: (r) => {
    const x = { ...r };
    delete x.budget_line_id;
    return x;
  },
  toRow: (t) => ({
    id: t.id,
    ...(t.parentId ? { parent_id: t.parentId } : {}),
    project_id: t.projectId,
    description: t.description,
    task: t.task,
    status: t.status,
    link: t.link,
    link_label: t.linkLabel,
    start_date: t.startDate,
    end_date: t.endDate,
    at_time: t.atTime,
    repeat_rule: t.repeatRule,
    expense: t.expense,
    notes: t.notes,
    done: t.done,
    done_at: t.doneAt,
    cleared: t.cleared,
    deleted_at: t.deletedAt,
    google_event_id: t.googleEventId,
    launch_id: t.launchId,
    ...(t.budgetLineId !== undefined ? { budget_line_id: t.budgetLineId } : {}),
    sort: t.sort
  }),
  fromRow: (r) => ({
    id: r.id,
    parentId: r.parent_id ?? null,
    projectId: r.project_id,
    description: r.description ?? '',
    task: r.task,
    status: r.status,
    link: r.link ?? '',
    linkLabel: r.link_label ?? '',
    startDate: r.start_date,
    endDate: r.end_date,
    atTime: r.at_time,
    repeatRule: r.repeat_rule,
    expense: r.expense ?? '',
    notes: r.notes ?? '',
    done: r.done,
    doneAt: r.done_at,
    cleared: r.cleared ?? false,
    deletedAt: r.deleted_at ?? null,
    googleEventId: r.google_event_id,
    launchId: r.launch_id,
    budgetLineId: r.budget_line_id ?? null,
    sort: r.sort
  })
});

/** Oct 28: Task is general (EOM BILL, Appointment), Description specific (Wix, Dentist). Shown together. */
export const taskName = (t: Pick<Task, 'task' | 'description'>) => [t.task.trim(), t.description.trim()].filter(Boolean).join(' · ') || 'Untitled';

export function newTask(sort: number, projectId: string | null = null): Task {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    projectId,
    description: '',
    task: '',
    status: 'WIP',
    link: '',
    linkLabel: '',
    startDate: isoDate(new Date()),
    endDate: null,
    atTime: null,
    repeatRule: null,
    expense: '',
    notes: '',
    done: false,
    doneAt: null,
    cleared: false,
    deletedAt: null,
    googleEventId: null,
    launchId: null,
    sort
  };
}

// ---------- Recurring rules ----------

/** How a task repeats (none for one-offs). */
export const repeatOf = (t: Task) => readRepeat(t.repeatRule, t.status);

/** Does a recurring task land on this day? */
export const repeatsOn = (t: Task, day: Date) => repeatOn(repeatOf(t), day);

export const isRecurring = (t: Task) => repeatOf(t).kind !== 'none';

// ---------- Sections (how the sheet sorts its list) ----------

export type Section = 'due' | 'key' | 'wip' | 'appts' | 'ondeck' | 'monthly' | 'annual' | 'pending' | 'done' | 'deleted';

export const SECTIONS: { id: Section; title: string; hint: string; pill?: string }[] = [
  { id: 'due', title: 'Due today', hint: 'Date required is today or earlier' },
  { id: 'key', title: '3 key tasks', hint: 'Picked in the Status cell: THREE' },
  { id: 'wip', title: 'In progress', hint: 'Due within 30 days' },
  { id: 'appts', title: 'Appointments', hint: '"Appointment" in the Task or Description' },
  { id: 'ondeck', title: 'On deck (+30 days)', hint: 'Due more than 30 days out', pill: 'On deck' },
  { id: 'monthly', title: 'Recurring: weekly, monthly, quarterly', hint: 'Repeat: weekly, monthly or quarterly', pill: 'Monthly' },
  { id: 'annual', title: 'Annual recurring', hint: 'Repeat: annually', pill: 'Annual' },
  { id: 'pending', title: 'Pending (no date)', hint: 'Anything without a date', pill: 'Pending' },
  { id: 'done', title: 'Completed', hint: 'Checked off' },
  { id: 'deleted', title: 'Recently deleted', hint: 'Removed in the last 30 days; restore from ⋯', pill: 'Deleted' }
];

const dayDiff = (iso: string, today: Date) => {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.round((a - b) / 86_400_000);
};

/** Recurring tasks checked off today count as done for today only. */
export const doneToday = (t: Task, today: Date) => !!t.doneAt && isoDate(new Date(t.doneAt)) === isoDate(today);

export function sectionOf(t: Task, today: Date): Section {
  if (t.deletedAt) return 'deleted';
  if (isRecurring(t)) {
    if (repeatsOn(t, today) && !doneToday(t, today)) return 'due';
    return repeatOf(t).kind === 'annual' ? 'annual' : 'monthly';
  }
  if (t.done) return 'done';
  const due = t.endDate ?? null;
  if (due && dayDiff(due, today) <= 0) return 'due';
  // Oct 28: only THREE (a key task) is picked by hand; the rest comes from the task itself.
  if (t.status === 'THREE') return 'key';
  if (isAppointment(t)) return 'appts';
  if (!due) return 'pending';
  return dayDiff(due, today) <= 30 ? 'wip' : 'ondeck';
}

/** "Appointment" in the Task or Description. */
export const isAppointment = (t: Task) => /\bappointment/i.test(`${t.task} ${t.description}`);

/** The status a task gets without THREE: what the Status cell shows. */
export function autoStatus(t: Task, today: Date): string {
  const s = sectionOf({ ...t, status: 'PENDING' }, today);
  return s === 'due' ? (dueBadge(t, today) ?? 'DUE') : s === 'wip' ? 'WIP' : s === 'appts' ? 'APPT' : s === 'ondeck' ? 'ON DECK' : s === 'pending' ? 'PENDING' : s === 'done' ? 'DONE' : '';
}

/** DUE / OVERDUE badge for rows in Due today. */
export function dueBadge(t: Task, today: Date): 'DUE' | 'OVERDUE' | null {
  if (isRecurring(t)) return repeatsOn(t, today) ? 'DUE' : null;
  if (!t.endDate || t.done) return null;
  const d = dayDiff(t.endDate, today);
  return d < 0 ? 'OVERDUE' : d === 0 ? 'DUE' : null;
}

export function groupTasks(list: Task[], today: Date) {
  const out = Object.fromEntries(SECTIONS.map((s) => [s.id, [] as Task[]])) as Record<Section, Task[]>;
  const ids = new Set(list.map((t) => t.id));
  // Steps travel with their task, so only top-level tasks are sorted into groups.
  const deleted = new Set(list.filter((t) => t.deletedAt).map((t) => t.id));
  for (const t of list) {
    if (t.done && t.cleared && !t.deletedAt) continue;
    // A step stays under its task, unless the step alone was deleted (then it shows in Recently deleted).
    const underParent = !!t.parentId && ids.has(t.parentId);
    if (underParent && !(t.deletedAt && !deleted.has(t.parentId!))) continue;
    out[sectionOf(t, today)].push(t);
  }
  // Oct 28: every group reads A-Z (Task, then Description); steps stay in their own order.
  const az = (x: string, y: string) => x.localeCompare(y, undefined, { sensitivity: 'base' });
  const byName = (a: Task, b: Task) => az(a.task, b.task) || az(a.description, b.description) || a.sort - b.sort;
  for (const k of Object.keys(out) as Section[]) out[k].sort(byName);
  return out;
}

// ---------- Import (Launch Sheet export → tasks) ----------

export type ImportRow = {
  project: string | null; // "STARDVST APP SHOP" or "STARDVST APP SHOP › LaunchPage"
  description?: string;
  task: string;
  status?: string;
  link?: string;
  linkLabel?: string;
  startDate?: string | null;
  endDate?: string | null;
  atTime?: string | null;
  repeatRule?: string | null;
  expense?: string;
  notes?: string;
  done?: boolean;
  doneAt?: string | null;
};

type ProjectLike = { id: string; name: string; color: string; parentId: string | null; calendarId: string | null; sort: number };

/**
 * Turns import rows into tasks. Projects are matched by name ("AREA › Project");
 * any that don't exist yet are created. Rows already in the list (same task,
 * description and project) are skipped, so importing twice doesn't double up.
 */
export function buildImport(rows: ImportRow[], existing: Task[], projects: ProjectLike[]) {
  const all = [...projects];
  const created: ProjectLike[] = [];
  const low = (s: string) => s.trim().toLowerCase();
  const findOrMake = (name: string, parentId: string | null) => {
    let p = all.find((x) => low(x.name) === low(name) && (parentId ? x.parentId === parentId : true));
    if (!p) {
      const parent = parentId ? all.find((x) => x.id === parentId) : null;
      p = { id: crypto.randomUUID(), name: name.trim(), color: parent?.color ?? '#C8C6C6', parentId, calendarId: null, sort: all.length };
      all.push(p);
      created.push(p);
    }
    return p;
  };
  const projectFor = (path: string | null) => {
    if (!path) return null;
    const [area, child] = path.split('›').map((s) => s.trim());
    const a = findOrMake(area, null);
    return child ? findOrMake(child, a.id).id : a.id;
  };
  const key = (t: { task: string; description: string; projectId: string | null; status: string; done: boolean }) =>
    `${low(t.task)}|${low(t.description)}|${t.projectId ?? ''}|${t.status}|${t.done}`;
  const seen = new Set(existing.map(key));
  let sort = existing.reduce((m, t) => Math.max(m, t.sort + 1), 0);
  const tasks: Task[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r.task?.trim()) continue;
    const t: Task = {
      ...newTask(sort++, projectFor(r.project)),
      description: r.description ?? '',
      task: r.task.trim(),
      status: r.status || 'PENDING',
      link: r.link ?? '',
      linkLabel: r.linkLabel ?? '',
      startDate: r.startDate ?? null,
      endDate: r.endDate ?? null,
      atTime: r.atTime ?? null,
      repeatRule: r.repeatRule ?? null,
      expense: r.expense ?? '',
      notes: r.notes ?? '',
      done: !!r.done,
      doneAt: r.doneAt ?? null
    };
    // Only rows already in LaunchPage are skipped; repeats inside the file (7 × "Wix -") all come in.
    if (seen.has(key(t))) {
      skipped += 1;
      continue;
    }
    tasks.push(t);
  }
  return { tasks, created, skipped };
}

/** Steps under each task, in order. */
export function stepsByParent(list: Task[]) {
  const m = new Map<string, Task[]>();
  const deleted = new Set(list.filter((t) => t.deletedAt).map((t) => t.id));
  for (const t of list) {
    if (!t.parentId) continue;
    if (t.deletedAt && !deleted.has(t.parentId)) continue; // deleted on its own: shown in Recently deleted
    m.set(t.parentId, [...(m.get(t.parentId) ?? []), t]);
  }
  for (const v of m.values()) v.sort((a, b) => a.sort - b.sort);
  return m;
}

/** A new step under a task: same project, description, status and dates. */
export function newStep(parent: Task, text: string, sort: number): Task {
  return {
    ...newTask(sort, parent.projectId),
    parentId: parent.id,
    task: text.trim(),
    description: parent.description,
    status: isRecurring(parent) ? 'WIP' : parent.status,
    startDate: parent.startDate,
    endDate: parent.endDate
  };
}

/** Removed more than 30 days ago: gone for good. */
export const trashExpired = (t: Task, now = new Date()) =>
  !!t.deletedAt && now.getTime() - new Date(t.deletedAt).getTime() > 30 * 86_400_000;
