import type { BudgetLine } from './budget';
import { readRepeat, writeRepeat } from './repeat';
import { newTask, repeatOf, type Task } from './tasks';

/**
 * Budget ↔ Tasks linking (LP-030 step 3, Oct 25).
 * 1. Exact duplicate tasks (same name, description, project, repeat, date, amount, link) keep one;
 *    the rest go to Recently deleted.
 * 2. Each budget line (not variable ones) is paired with the task that best matches its name (then repeat, amount,
 *    project). The budget line wins: the task takes its name, repeat / date and amount.
 * 3. Fixed, annual and planned lines left without a task get a new one. Variable lines
 *    (groceries, beer) stay budget-only.
 */

const norm = (s: string) => s.toLowerCase().replace(/^stardvst\s+/, '').replace(/[^a-z0-9]/g, '');

/** Every task that's live: not deleted, not a step, not a finished one-off. */
const live = (t: Task) => !t.deletedAt && !t.parentId && !(t.done && t.cleared);

const repeatKey = (t: Task) => writeRepeat(repeatOf(t)) ?? '';
const lineRepeat = (l: BudgetLine) => writeRepeat(readRepeat(l.repeat)) ?? '';
const amountOf = (expense: string) => {
  const n = Number(String(expense).replace(/[^0-9.-]/g, ''));
  return expense && Number.isFinite(n) ? n : null;
};

export interface LinkPlan {
  /** Duplicates going to Recently deleted. */
  remove: Task[];
  /** Existing tasks, now linked and carrying the budget line's fields. */
  linked: { task: Task; line: BudgetLine }[];
  /** New tasks for fixed / annual / planned lines that had none. */
  created: { task: Task; line: BudgetLine }[];
  /** Fields still missing after linking, for the check. */
  gaps: { line: BudgetLine; missing: string[] }[];
}

/** The task's fields, taken from its budget line (the budget wins). */
export function fromLine(t: Task, l: BudgetLine): Task {
  const rep = readRepeat(l.repeat);
  return {
    ...t,
    task: l.description || t.task,
    repeatRule: rep.kind === 'none' ? (l.date ? null : t.repeatRule) : writeRepeat(rep),
    // A repeating bill has no single due date; a one-off takes the line's date.
    endDate: rep.kind === 'none' ? l.date ?? t.endDate : null,
    status: rep.kind === 'none' ? t.status : t.status === 'MTH RCR' || t.status === 'ANN RCR' ? 'PENDING' : t.status,
    expense: l.amount === null ? t.expense : String(l.amount),
    budgetLineId: l.id
  };
}

export function planLinks(lines: BudgetLine[], tasks: Task[], opts: { now: string; projectFor: (name: string) => string | null }): LinkPlan {
  // 1 · Exact duplicates. Keep the one with the most attached (steps, a launch, a calendar event, notes).
  const children = (id: string) => tasks.filter((x) => x.parentId === id && !x.deletedAt).length;
  const weight = (t: Task) => children(t.id) * 100 + (t.budgetLineId ? 50 : 0) + (t.launchId ? 20 : 0) + (t.googleEventId ? 10 : 0) + Math.min(t.notes.length, 9);
  const dupKey = (t: Task) => [norm(t.task), norm(t.description), t.projectId ?? '', repeatKey(t), t.endDate ?? '', t.expense.trim(), t.link.trim()].join('|');
  const groups = new Map<string, Task[]>();
  for (const t of tasks.filter(live)) {
    const k = dupKey(t);
    if (!norm(t.task)) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const remove: Task[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const keep = [...g].sort((a, b) => weight(b) - weight(a) || a.sort - b.sort)[0];
    for (const t of g) if (t !== keep) remove.push({ ...t, deletedAt: opts.now });
  }
  const gone = new Set(remove.map((t) => t.id));
  const pool = tasks.filter((t) => live(t) && !gone.has(t.id));

  // 2 · Pair lines with tasks. Lines already linked keep their task.
  const taken = new Set(pool.filter((t) => t.budgetLineId && lines.some((l) => l.id === t.budgetLineId)).map((t) => t.id));
  const done = new Set(pool.filter((t) => taken.has(t.id)).map((t) => t.budgetLineId!));
  const pairs: { score: number; t: Task; l: BudgetLine }[] = [];
  for (const l of lines) {
    // Variable lines (groceries, beer) are an allotment, not a bill: never linked.
    if (done.has(l.id) || l.section === 'variable') continue;
    const ln = norm(l.description);
    if (ln.length < 3) continue;
    for (const t of pool) {
      if (taken.has(t.id)) continue;
      const names = [norm(t.task), norm(t.linkLabel), norm(`${t.task}${t.linkLabel}`)].filter((x) => x.length >= 3);
      const exact = names.some((n) => n === ln);
      const near = !exact && names.some((n) => n.includes(ln) || ln.includes(n));
      if (!exact && !near) continue;
      let score = exact ? 10 : 4;
      if (lineRepeat(l) && lineRepeat(l) === repeatKey(t)) score += 4;
      else if (readRepeat(l.repeat).kind !== 'none' && readRepeat(l.repeat).kind === repeatOf(t).kind) score += 2;
      if (l.amount !== null && amountOf(t.expense) === l.amount) score += 3;
      const pid = opts.projectFor(l.project);
      if (pid && pid === t.projectId) score += 1;
      pairs.push({ score, t, l });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.l.sort - b.l.sort || a.t.sort - b.t.sort);
  const linked: LinkPlan['linked'] = [];
  for (const { t, l } of pairs) {
    if (taken.has(t.id) || done.has(l.id)) continue;
    taken.add(t.id);
    done.add(l.id);
    // A task with no project takes the line's.
    linked.push({ task: { ...fromLine(t, l), projectId: t.projectId ?? opts.projectFor(l.project) }, line: l });
  }
  // Already-linked tasks also take their line's fields, so both sides match.
  for (const t of pool) {
    const l = t.budgetLineId ? lines.find((x) => x.id === t.budgetLineId) : undefined;
    if (l && !linked.some((x) => x.task.id === t.id)) {
      const next = fromLine(t, l);
      if (JSON.stringify(next) !== JSON.stringify(t)) linked.push({ task: next, line: l });
    }
  }

  // 3 · New tasks for bills with none.
  let sort = tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0);
  const created: LinkPlan['created'] = [];
  for (const l of lines) {
    if (done.has(l.id) || l.section === 'variable' || !l.description.trim()) continue;
    const t = fromLine({ ...newTask(sort++, opts.projectFor(l.project)), status: 'PENDING', description: l.category || l.pmtCategory || '', notes: l.notes }, l);
    created.push({ task: t, line: l });
    done.add(l.id);
  }

  // The check: what each linked pair is still missing.
  const gaps: LinkPlan['gaps'] = [];
  for (const { task, line } of [...linked, ...created]) {
    const missing: string[] = [];
    if (line.amount === null) missing.push('amount');
    if (!line.date && readRepeat(line.repeat).kind === 'none') missing.push('date or repeat');
    if (!line.method.trim()) missing.push('method');
    if (!line.pmtCategory.trim()) missing.push('pmt category');
    if (!task.projectId) missing.push('task project');
    if (missing.length) gaps.push({ line, missing });
  }
  return { remove, linked, created, gaps };
}
