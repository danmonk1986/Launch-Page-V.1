import { makeStore } from './store';
import { isoDate } from './launchers';

/** Statuses from the Launch Sheet. DUE and OVERDUE are worked out from the date, not picked. */
export const STATUSES = ['THREE', 'WIP', 'APPTS', 'ON DECK', 'PENDING', 'MTH RCR', 'ANN RCR'] as const;
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
  projectId: string | null;
  description: string;
  task: string;
  status: Status;
  link: string;
  linkLabel: string;
  startDate: string | null;
  endDate: string | null; // date required
  atTime: string | null; // "HH:MM"
  repeatRule: string | null; // "17" (day of month), "1st THU", "LAST WED", or "MM-DD" for annual
  expense: string;
  notes: string;
  done: boolean;
  doneAt: string | null;
  /** Done and cleared off the Done list (kept for 26 Days and history). */
  cleared: boolean;
  googleEventId: string | null;
  launchId: string | null;
  sort: number;
}

type Row = {
  id: string;
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
  google_event_id: string | null;
  launch_id: string | null;
  sort: number;
};

export const taskStore = makeStore<Task, Row>({
  table: 'tasks',
  localKey: 'launchpage.tasks.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0008_projects_tasks.sql',
  seed: () => [],
  toRow: (t) => ({
    id: t.id,
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
    google_event_id: t.googleEventId,
    launch_id: t.launchId,
    sort: t.sort
  }),
  fromRow: (r) => ({
    id: r.id,
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
    googleEventId: r.google_event_id,
    launchId: r.launch_id,
    sort: r.sort
  })
});

export function newTask(sort: number, projectId: string | null = null): Task {
  return {
    id: crypto.randomUUID(),
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
    googleEventId: null,
    launchId: null,
    sort
  };
}

// ---------- Recurring rules ----------

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Does a recurring task land on this day? Monthly: "17", "1st THU", "LAST WED". Annual: "MM-DD". */
export function repeatsOn(t: Task, day: Date) {
  const rule = (t.repeatRule ?? '').trim().toUpperCase();
  if (!rule) return false;
  if (t.status === 'ANN RCR') {
    const m = rule.match(/^(\d{1,2})-(\d{1,2})$/);
    return !!m && Number(m[1]) === day.getMonth() + 1 && Number(m[2]) === day.getDate();
  }
  if (/^\d{1,2}$/.test(rule)) {
    const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    return Math.min(Number(rule), last) === day.getDate();
  }
  const m = rule.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  if (!m) return false;
  const dow = DOW.indexOf(m[2]);
  if (dow !== day.getDay()) return false;
  if (m[1] === 'LAST') return day.getDate() + 7 > new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return Math.ceil(day.getDate() / 7) === parseInt(m[1], 10);
}

export const isRecurring = (t: Task) => t.status === 'MTH RCR' || t.status === 'ANN RCR';

// ---------- Sections (how the sheet sorts its list) ----------

export type Section = 'due' | 'key' | 'wip' | 'appts' | 'ondeck' | 'monthly' | 'annual' | 'pending' | 'done';

export const SECTIONS: { id: Section; title: string; hint: string; pill?: string }[] = [
  { id: 'due', title: 'Due today', hint: 'Date required is today or earlier' },
  { id: 'key', title: '3 key tasks', hint: 'Status THREE' },
  { id: 'wip', title: 'In progress', hint: 'Status WIP, or due within 30 days' },
  { id: 'appts', title: 'Appointments', hint: 'Status APPOINTMENT' },
  { id: 'ondeck', title: 'On deck (+30 days)', hint: 'Due more than 30 days out, or ON DECK', pill: 'On deck' },
  { id: 'monthly', title: 'Monthly recurring', hint: 'MTH RCR', pill: 'Monthly' },
  { id: 'annual', title: 'Annual recurring', hint: 'ANN RCR', pill: 'Annual' },
  { id: 'pending', title: 'Pending (no date)', hint: 'Anything without a date', pill: 'Pending' },
  { id: 'done', title: 'Completed', hint: 'Checked off' }
];

const dayDiff = (iso: string, today: Date) => {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.round((a - b) / 86_400_000);
};

/** Recurring tasks checked off today count as done for today only. */
export const doneToday = (t: Task, today: Date) => !!t.doneAt && isoDate(new Date(t.doneAt)) === isoDate(today);

export function sectionOf(t: Task, today: Date): Section {
  if (isRecurring(t)) {
    if (repeatsOn(t, today) && !doneToday(t, today)) return 'due';
    return t.status === 'ANN RCR' ? 'annual' : 'monthly';
  }
  if (t.done) return 'done';
  const due = t.endDate ?? null;
  if (due && dayDiff(due, today) <= 0) return 'due';
  if (t.status === 'THREE') return 'key';
  if (t.status === 'WIP') return 'wip';
  if (t.status === 'APPTS') return 'appts';
  if (t.status === 'ON DECK') return 'ondeck';
  if (!due) return 'pending';
  return dayDiff(due, today) <= 30 ? 'wip' : 'ondeck';
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
  for (const t of list) if (!(t.done && t.cleared)) out[sectionOf(t, today)].push(t);
  const byDate = (a: Task, b: Task) =>
    (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || (a.atTime ?? '99').localeCompare(b.atTime ?? '99') || a.sort - b.sort;
  for (const k of Object.keys(out) as Section[]) out[k].sort(byDate);
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
