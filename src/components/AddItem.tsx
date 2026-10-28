import { useId, useMemo, useState } from 'react';
import { FormActions } from './Sheet';
import { MoneyField, settleMoney, type Money } from './MoneyField';
import { TitleCombo } from './Launchers';
import { RepeatPicker } from './RepeatPicker';
import { BUDGET_CATEGORIES, BUDGET_SECTIONS, newBudgetLine, type BudgetLine, type BudgetSection } from '../lib/budget';
import { MONTHS, NO_REPEAT, repeatOn, writeRepeat, type Repeat } from '../lib/repeat';
import { newTask, type Task } from '../lib/tasks';
import type { Project } from '../lib/projects';

export type AddItemResult = { task: Task | null; line: BudgetLine };

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
 * Add item (LP-030, Oct 25): expenses start in Budget. Every budget item also gets a linked task
 * (ticking it adds the item to Expenses) unless "Also add to Tasks" is unticked for that item;
 * it starts unticked for Monthly variable lines (an allotment, nothing to tick). After saving,
 * the full task form opens for the task's details.
 */
export function AddItemForm(p: {
  lines: BudgetLine[];
  tasks: Task[];
  projects: Project[];
  onSave: (r: AddItemResult) => Promise<void>;
}) {
  const formId = useId();
  const [name, setName] = useState('');
  // null = follow the group (ticked, except Monthly variable); a tick sets it for this item.
  const [taskPick, setTaskPick] = useState<boolean | null>(null);
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT);
  const [date, setDate] = useState('');
  const [money, setMoney] = useState<Money>({ amount: null, foreign: null, currency: 'CAD' });
  const [err, setErr] = useState('');
  const [section, setSection] = useState<BudgetSection | ''>('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [pmtCategory, setPmtCategory] = useState('');
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes] = useState('');
  const group: BudgetSection = section || sectionFor(repeat);
  const toTasks = taskPick ?? group !== 'variable';
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const preview = useMemo(() => (repeat.kind === 'none' ? (date ? [date] : []) : nextDates(repeat, 4)), [repeat, date]);
  const where = toTasks ? 'Budget and Tasks' : 'Budget';

  const build = (m: Money): AddItemResult => {
    const rule = writeRepeat(repeat);
    const project = p.projects.find((x) => x.id === projectId) ?? null;
    const other = m.currency !== 'CAD' && m.foreign !== null;
    const line: BudgetLine = {
          ...newBudgetLine(group, p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0)),
          description: name.trim(),
          project: project ? project.name.replace(/^STARDVST\s+/i, '') : '',
          date: rule ? null : date || null,
          repeat: rule,
          amount: m.amount,
          ...(other ? { currency: m.currency, foreign: m.foreign } : {}),
          category,
          method: method.trim(),
          pmtCategory: pmtCategory.trim().toUpperCase(),
          notes: notes.trim()
        };
    const task: Task | null = toTasks
      ? {
          ...newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), project?.id ?? null),
          task: name.trim(),
          status: 'PENDING',
          description: category,
          endDate: rule ? null : date || null,
          repeatRule: rule,
          expense: other ? `${m.foreign} ${m.currency}` : m.amount === null ? '' : String(m.amount),
          notes: notes.trim(),
          budgetLineId: line.id
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
        if (!name.trim()) return;
        setErr('');
        void settleMoney(money).then(
          (m) => p.onSave(build(m)),
          (x) => setErr(x instanceof Error ? x.message : 'No rate right now.')
        );
      }}
    >
      <div className="budget-grid">
        <label className="field budget-wide">
          <span>Name</span>
          <input value={name} autoFocus required placeholder="Rent" onChange={(e) => setName(e.target.value)} />
        </label>
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
            {[...p.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(
        <fieldset className="add-item-box">
          <legend>Budget</legend>
          <div className="budget-grid">
            <MoneyField value={money} onChange={setMoney} />
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
              <span>Budget group</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">—</option>
                {[...BUDGET_CATEGORIES].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map((c) => (
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
              <span>Payment category</span>
              <TitleCombo value={pmtCategory} titles={picks((l) => l.pmtCategory)} required={false} placeholder="RENT" onChange={setPmtCategory} list="budget:pmt" />
            </div>
          </div>
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
      <label className="choice add-item-task">
        <input type="checkbox" checked={toTasks} onChange={(e) => setTaskPick(e.target.checked)} />
        <span>Also add to Tasks</span>
      </label>
      <p className="field-hint add-item-task-hint">
        {toTasks
          ? 'Saves a linked task too, then opens the task form for its details. Ticking the task adds this to Expenses.'
          : group === 'variable'
            ? 'Monthly variable lines are an allotment, so no task by default.'
            : 'Budget only: no task.'}
      </p>
      {err && <p className="field-hint budget-over">{err}</p>}
      <FormActions formId={formId} saveDisabled={!name.trim()} />
    </form>
  );
}

