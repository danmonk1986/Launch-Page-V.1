import { makeStore } from './store';

/** V20-253 (Dan, Nov 15): a project holds plans (BETA BACKEND, BETA – WEEK 1…); a plan holds decisions. */
export interface Plan {
  id: string;
  projectId: string | null;
  name: string;
  description: string;
  startDate: string | null;
  decideBy: string | null;
  notes: string;
  /** Nov 19 (Dan): the one task this plan is in Tasks (its decisions are that task's steps). */
  taskId: string | null;
  sort: number;
}
type Row = {
  id: string;
  project_id: string | null;
  name: string;
  description: string;
  start_date: string | null;
  decide_by: string | null;
  notes: string;
  task_id: string | null;
  sort: number;
};

export const planStore = makeStore<Plan, Row>({
  table: 'plans',
  localKey: 'launchpage.plans.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0067_plan_task.sql',
  seed: () => [],
  toRow: (p) => ({ id: p.id, project_id: p.projectId, name: p.name, description: p.description, start_date: p.startDate, decide_by: p.decideBy, notes: p.notes, task_id: p.taskId, sort: p.sort }),
  fromRow: (r) => ({ id: r.id, projectId: r.project_id, name: r.name ?? '', description: r.description ?? '', startDate: r.start_date, decideBy: r.decide_by, notes: r.notes ?? '', taskId: r.task_id ?? null, sort: r.sort ?? 0 })
});

export function newPlan(projectId: string | null, sort: number): Plan {
  return { id: crypto.randomUUID(), projectId, name: '', description: '', startDate: null, decideBy: null, notes: '', taskId: null, sort };
}
