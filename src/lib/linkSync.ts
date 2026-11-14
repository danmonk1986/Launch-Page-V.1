import type { Launch } from './rockets';
import { taskName, type Task } from './tasks';

/**
 * V20-201 (Dan, Nov 14): a task and the timed launch made from it (task.launchId) stay in step both ways:
 * - Name: only while they still match (a launch renamed with its own What / project prefix keeps its name).
 * - Date and time: a Once launch's date ↔ the task's due date; its time ↔ the task's time. A repeating
 *   launch shares the time only.
 * - Project.
 * - Link: the task's link ↔ the launch's web link (internal links like launchpage: or claude:// stay put).
 * Ticking either one done is handled by the caller; deleting either one just unlinks.
 */
const web = (u: string) => /^https?:\/\//i.test(u);

/** The launch changed (old → next): what its linked task should become, or null if nothing changes. */
export function taskFromLaunch(old: Launch, next: Launch, t: Task): Task | null {
  let u: Task = { ...t };
  if (old.title !== next.title && taskName(t) === old.title) {
    const [task, ...rest] = next.title.split(' · ');
    u = t.description ? { ...u, task: task.trim(), description: rest.join(' · ').trim() } : { ...u, task: next.title.trim() };
  }
  if (next.repeat === 'once' && next.onDate && old.onDate !== next.onDate) {
    const single = !t.startDate || t.startDate === t.endDate;
    u = { ...u, endDate: next.onDate, startDate: single ? next.onDate : t.startDate && t.startDate > next.onDate ? next.onDate : t.startDate };
  }
  if (old.atTime !== next.atTime) u = { ...u, atTime: next.atTime };
  if ((old.projectId ?? null) !== (next.projectId ?? null)) u = { ...u, projectId: next.projectId ?? null };
  if (t.link && old.urls.includes(t.link) && !next.urls.includes(t.link)) u = { ...u, link: next.urls.find(web) ?? '' };
  else if (!t.link && !old.urls.some(web) && next.urls.some(web)) u = { ...u, link: next.urls.find(web)! };
  return JSON.stringify(u) === JSON.stringify(t) ? null : u;
}

/** The task changed (old → next): what its linked launch should become, or null if nothing changes. */
export function launchFromTask(old: Task, next: Task, l: Launch): Launch | null {
  let u: Launch = { ...l };
  if (taskName(old) !== taskName(next) && taskName(old) === l.title) u = { ...u, title: taskName(next) };
  const due = next.endDate ?? next.startDate;
  if (l.repeat === 'once' && due && (old.endDate ?? old.startDate) !== due) u = { ...u, onDate: due, onceTime: null };
  if (next.atTime && old.atTime !== next.atTime) u = { ...u, atTime: next.atTime };
  if ((old.projectId ?? null) !== (next.projectId ?? null)) u = { ...u, projectId: next.projectId ?? null };
  if (old.link !== next.link) {
    const rest = l.urls.filter((x) => x !== old.link);
    u = { ...u, urls: next.link ? [next.link, ...rest.filter((x) => x !== next.link)] : rest };
  }
  return JSON.stringify(u) === JSON.stringify(l) ? null : u;
}
