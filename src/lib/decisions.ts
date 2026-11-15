import { makeStore } from './store';

/**
 * V20-247 (Dan, Nov 14): Project Planner. A decision belongs to a project; its options sit under it like task steps.
 * Status: open → deciding → waiting → decided → done.
 */
export type DecisionStatus = 'open' | 'deciding' | 'waiting' | 'decided' | 'done';
export const DECISION_STATUSES: DecisionStatus[] = ['open', 'deciding', 'waiting', 'decided', 'done'];
export interface DecisionOption { id: string; name: string; note: string; cost: string; picked: boolean; /** V20-259 */ link?: string }
export interface Decision {
  id: string;
  projectId: string | null;
  /** V20-253: the plan it sits in. */
  planId: string | null;
  title: string;
  description: string;
  status: DecisionStatus;
  decideBy: string | null;
  who: string;
  cost: string;
  notes: string;
  options: DecisionOption[];
  taskId: string | null;
  launchId: string | null;
  sort: number;
}
type Row = {
  id: string;
  project_id: string | null;
  plan_id: string | null;
  title: string;
  description: string;
  status: string;
  decide_by: string | null;
  who: string;
  cost: string;
  notes: string;
  options: DecisionOption[] | null;
  task_id: string | null;
  launch_id: string | null;
  sort: number;
};

export const decisionStore = makeStore<Decision, Row>({
  table: 'decisions',
  localKey: 'launchpage.decisions.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0063_decisions.sql',
  seed: () => [],
  toRow: (d) => ({
    id: d.id, project_id: d.projectId, plan_id: d.planId, title: d.title, description: d.description, status: d.status, decide_by: d.decideBy,
    who: d.who, cost: d.cost, notes: d.notes, options: d.options, task_id: d.taskId, launch_id: d.launchId, sort: d.sort
  }),
  fromRow: (r) => ({
    id: r.id, projectId: r.project_id, planId: r.plan_id ?? null, title: r.title ?? '', description: r.description ?? '',
    status: (DECISION_STATUSES as string[]).includes(r.status) ? (r.status as DecisionStatus) : 'open',
    decideBy: r.decide_by, who: r.who ?? '', cost: r.cost ?? '', notes: r.notes ?? '',
    options: Array.isArray(r.options) ? r.options : [], taskId: r.task_id, launchId: r.launch_id, sort: r.sort ?? 0
  })
});

export function newDecision(projectId: string | null, sort: number, planId: string | null = null): Decision {
  return { id: crypto.randomUUID(), projectId, planId, title: '', description: '', status: 'open', decideBy: null, who: '', cost: '', notes: '', options: [], taskId: null, launchId: null, sort };
}

/** Sorted by date, undated at the bottom, then by sort. */
export function byDate(a: Decision, b: Decision): number {
  if (a.decideBy && b.decideBy && a.decideBy !== b.decideBy) return a.decideBy < b.decideBy ? -1 : 1;
  if (a.decideBy && !b.decideBy) return -1;
  if (!a.decideBy && b.decideBy) return 1;
  return a.sort - b.sort;
}
