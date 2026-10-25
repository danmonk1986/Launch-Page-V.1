import { useId, useMemo, useState } from 'react';
import { FormActions } from './Sheet';
import { TitleCombo } from './Launchers';
import { RepeatPicker } from './RepeatPicker';
import { BUDGET_CATEGORIES, BUDGET_SECTIONS, newBudgetLine, type BudgetLine, type BudgetSection } from '../lib/budget';
import { MONTHS, NO_REPEAT, repeatOn, writeRepeat, type Repeat } from '../lib/repeat';
import { newTask, type Task } from '../lib/tasks';
import type { Project } from '../lib/projects';

export type AddItemResult = { task: Task | null; line: BudgetLine | null };

const short = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next few dates a repeat lands on, from today. */
export function nextDates(r: Repeat, n: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 800 && out.length < n; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12);
    if (repeatOn(r, d)) out.push(iso(d));
  }
  return out;
}

const sectionFor = (r: Repeat): BudgetSection => (r.kind === 'annual' ? 'annual' : r.kind === 'none' ? 'planned' : 'fixed');

/**
 * Add item (LP-030 step 4): one pop-up on Tasks and Budget. Name, then where it goes. Both
 * ticked = one item, a linked task + budget line; ticking the task adds it to Expenses.
 */
export function AddItemForm(p: {
  goesTo: { tasks: boolean; budget: boolean };
  lines: BudgetLine[];
  tasks: Task[];
  projects: Project[];
  onSave: (r: AddItemResult) => Promise<void>;
  /** Tasks only: carry on in the full task form (steps, link, status, time). */
  onMoreTaskFields?: (t: Task) => void;
}) {
  const formId = useId();
  const [name, setName] = useState('');
  const [toTasks, setToTasks] = useState(p.goesTo.tasks);
  const [toBudget, setToBudget] = useState(p.goesTo.budget);
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [section, setSection] = useState<BudgetSection | ''>('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [pmtCategory, setPmtCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes] = useState('');
  const group: BudgetSection = section || sectionFor(repeat);
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const preview = useMemo(() => (repeat.kind === 'none' ? (date ? [date] : []) : nextDates(repeat, 4)), [repeat, date]);
  const where = toTasks && toBudget ? 'Tasks and Budget' : toTasks ? 'Tasks' : toBudget ? 'Budget' : '';

  const build = (): AddItemResult => {
    const rule = writeRepeat(repeat);
    const project = p.projects.find((x) => x.id === projectId) ?? null;
    const money = amount === '' ? null : Number(amount);
    const line: BudgetLine | null = toBudget
      ? {
          ...newBudgetLine(group, p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0)),
          description: name.trim(),
          project: project ? project.name.replace(/^STARDVST\s+/i, '') : '',
          date: rule ? null : date || null,
          repeat: rule,
          amount: money,
          category,
          method: method.trim(),
          pmtCategory: pmtCategory.trim().toUpperCase(),
          notes: notes.trim()
        }
      : null;
    const task: Task | null = toTasks
      ? {
          ...newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), project?.id ?? null),
          task: name.trim(),
          status: line ? 'PENDING' : 'WIP',
          description: category,
          endDate: rule ? null : date || null,
          repeatRule: rule,
          expense: money === null ? '' : String(money),
          notes: notes.trim(),
          budgetLineId: line?.id ?? null
        }
      : null;
    return { task, line };
  };

  return (
    <form
      id={formId}
      className="task-form budget-form add-item"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && (toTasks || toBudget)) void p.onSave(build());
      }}
    >
      <div className="budget-grid">
        <label className="field budget-wide">
          <span>Name</span>
          <input value={name} autoFocus required placeholder="Rent" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field budget-wide">
          <legend>Goes to</legend>
          <div className="choice-row add-item-goes">
            <label className="choice">
              <input type="checkbox" checked={toTasks} onChange={(e) => setToTasks(e.target.checked)} />
              <span>Tasks</span>
            </label>
            <label className="choice">
              <input type="checkbox" checked={toBudget} onChange={(e) => setToBudget(e.target.checked)} />
              <span>Budget</span>
            </label>
          </div>
          <p className="field-hint">
            {toTasks && toBudget
              ? 'Both ticked: one item, linked. Ticking the task adds it to Expenses for that month.'
              : !toTasks && !toBudget
                ? 'Tick at least one.'
                : 'Tick both to link a task and a budget line.'}
          </p>
        </fieldset>
        <RepeatPicker value={repeat} from={date || null} onChange={setRepeat} />
        {repeat.kind === 'none' && (
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">—</option>
            {p.projects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {toBudget && (
        <fieldset className="add-item-box">
          <legend>Budget</legend>
          <div className="budget-grid">
            <label className="field">
              <span>Amount ($)</span>
              <input type="number" inputMode="decimal" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              <span>Group</span>
              <select value={group} onChange={(e) => setSection(e.target.value as BudgetSection)}>
                {BUDGET_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Budget category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">—</option>
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Pmt method</span>
              <TitleCombo value={method} titles={picks((l) => l.method)} required={false} placeholder="e-Transfer" onChange={setMethod} list="budget:method" />
            </div>
            <div className="field">
              <span>Pmt category</span>
              <TitleCombo value={pmtCategory} titles={picks((l) => l.pmtCategory)} required={false} placeholder="RENT" onChange={setPmtCategory} list="budget:pmt" />
            </div>
          </div>
          {group === 'variable' && toTasks && <p className="field-hint">Variable lines are an allotment; a linked task adds the planned amount when ticked.</p>}
        </fieldset>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {where && (
        <p className="add-item-preview">
          Shows in <strong>{where}</strong>: {preview.length ? preview.map(short).join(' · ') + (repeat.kind !== 'none' ? ' …' : '') : 'no date yet'}
        </p>
      )}
      {toTasks && !toBudget && p.onMoreTaskFields && (
        <button type="button" className="btn btn-quiet add-item-more" disabled={!name.trim()} onClick={() => p.onMoreTaskFields!(build().task!)}>
          More task fields (steps, link, time)…
        </button>
      )}
      <FormActions formId={formId} saveDisabled={!name.trim() || (!toTasks && !toBudget)} />
    </form>
  );
}

