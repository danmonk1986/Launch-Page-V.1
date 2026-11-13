import { useEffect, useId, useMemo, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { TitleCombo } from './Rockets';
import { BUDGET_CATEGORIES, PMT_TYPES, money, type BudgetLine } from '../lib/budget';
import { MONTHS } from '../lib/repeat';
import { monthKey, newExpense, type Expense } from '../lib/expenses';
import { MoneyField, settleMoney } from './MoneyField';
import { AmountInput } from './AmountInput';
import { originalLabel } from '../lib/currency';
import { projectForDivision, type Project } from '../lib/projects';

const PLUS = 'M12 5v14M5 12h14';
/** Nov 1: what the totals add up by (the square button cycles; remembered on this device). */
type Tally = 'pmtCategory' | 'category' | 'method' | 'type' | 'project';
const TALLY_KEY = 'launchpage.records.tally';
const TALLIES: { id: Tally; label: string; icon: string }[] = [
  { id: 'pmtCategory', label: 'Category', icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01' },
  { id: 'category', label: 'Group', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'method', label: 'Method', icon: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4' },
  { id: 'type', label: 'Type', icon: 'M12 3v18M5 8h14M5 16h14' },
  { id: 'project', label: 'Division', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }
];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const thisMonth = () => iso(new Date()).slice(0, 7);
export const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + by, 1, 12);
  return iso(d).slice(0, 7);
};
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`.toUpperCase();
export const dayLabel = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** ‹ NOV 2026 › — tap the month to come back to this one. */
export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="d26-range month-nav" role="group" aria-label="Month">
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        ‹
      </button>
      <button type="button" aria-pressed="true" title="Back to this month" onClick={() => onChange(thisMonth())}>
        {monthLabel(month)}
      </button>
      <button type="button" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        ›
      </button>
    </div>
  );
}

type Props = {
  month: string;
  onMonth: (m: string) => void;
  expenses: Expense[];
  lines: BudgetLine[];
  search: string;
  onSave: (e: Expense) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Records (Nov 1): the month selector and + live in the Records header; each tap of + bumps this. */
  addTick?: number;
  /** Division pills in their project's colour. */
  projects?: Project[];
};

/**
 * Expenses (LP-030): what was actually paid, a month at a time, in the Launch Sheet's
 * EXPENSES columns. Ticking a task linked to a budget line adds a row here.
 */
export function ExpensesView(p: Props) {
  const { month, onMonth: setMonth } = p;
  const [editing, setEditing] = useState<Expense | null>(null);
  const needle = p.search.trim().toLowerCase();

  const monthRows = useMemo(
    () =>
      p.expenses
        .filter((e) => monthKey(e.date) === month)
        .filter((e) => !needle || [e.description, e.project, e.method, e.type, e.category, e.pmtCategory, e.notes, e.amount === null ? '' : String(e.amount)].some((v) => v.toLowerCase().includes(needle)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort),
    [p.expenses, month, needle]
  );
  const total = monthRows.reduce((a, e) => a + (e.amount ?? 0), 0);
  const gst = monthRows.reduce((a, e) => a + (e.gst ?? 0), 0);
  // The sheet's per-category columns: TOTAL split by PMT CATEGORY, or (Nov 1) by group, method,
  // type or division; the square button switches, a total shows just its lines.
  const [tally, setTallyState] = useState<Tally>(() => {
    try {
      const v = localStorage.getItem(TALLY_KEY) as Tally | null;
      return v && TALLIES.some((t) => t.id === v) ? v : 'pmtCategory';
    } catch {
      return 'pmtCategory';
    }
  });
  const [pick, setPick] = useState<string | null>(null);
  const setTally = (t: Tally) => {
    setTallyState(t);
    setPick(null);
    try {
      localStorage.setItem(TALLY_KEY, t);
    } catch {
      /* ignore */
    }
  };
  const keyOf = (e: Expense) => e[tally].trim().toUpperCase() || 'OTHER';
  const byPmt = monthRows.reduce<Record<string, number>>((m, e) => {
    const k = keyOf(e);
    m[k] = (m[k] ?? 0) + (e.amount ?? 0);
    return m;
  }, {});
  const ti = TALLIES.findIndex((t) => t.id === tally);
  const nextTally = TALLIES[(ti + 1) % TALLIES.length];
  const rows = pick ? monthRows.filter((e) => keyOf(e) === pick) : monthRows;
  const lineName = (id: string | null) => (id ? p.lines.find((l) => l.id === id)?.description : undefined);
  const picks = (f: (x: { project: string; method: string; pmtCategory: string }) => string) =>
    [...new Set([...p.expenses, ...p.lines].map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const addNew = () => {
    const today = iso(new Date());
    setEditing(newExpense(monthKey(today) === month ? today : `${month}-01`, p.expenses.reduce((m, e) => Math.max(m, e.sort + 1), 0)));
  };
  useEffect(() => {
    if (p.addTick) addNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.addTick]);

  return (
    <div className="expenses">
      {p.addTick === undefined && (
        <div className="expenses-bar">
          <MonthNav month={month} onChange={setMonth} />
          <button type="button" className="btn btn-quiet expenses-add" onClick={addNew}>
            <Icon d={PLUS} size={16} /> Add expense
          </button>
        </div>
      )}

      <div className="budget-stats" aria-label="This month's expenses">
        <button
          type="button"
          className="icon-btn tool-btn budget-groupby"
          aria-label={`Totals by ${TALLIES[ti].label}. Switch to ${nextTally.label}`}
          title={`By ${TALLIES[ti].label} · tap for ${nextTally.label}`}
          onClick={() => setTally(nextTally.id)}
        >
          <Icon d={TALLIES[ti].icon} size={18} />
        </button>
        <button type="button" className="budget-stat budget-stat-total" aria-pressed={pick === null} title="Show everything" onClick={() => setPick(null)}>
          <span className="budget-stat-label">Spent · {monthLabel(month)} · by {TALLIES[ti].label}</span>
          <span className="budget-stat-value">{money(total)}</span>
        </button>
        {gst > 0 && (
          <div className="budget-stat">
            <span className="budget-stat-label">GST/HST</span>
            <span className="budget-stat-value">{money(gst)}</span>
          </div>
        )}
        {Object.keys(byPmt)
          .sort((a, b) => byPmt[b] - byPmt[a])
          .map((k) => (
            <button key={k} type="button" className="budget-stat" aria-pressed={pick === k} title={pick === k ? 'Show everything' : `Show only ${k}`} onClick={() => setPick(pick === k ? null : k)}>
              <span className="budget-stat-label">{k}</span>
              <span className="budget-stat-value">{money(byPmt[k])}</span>
            </button>
          ))}
      </div>

      {rows.length === 0 ? (
        <p className="panel-empty">
          {needle ? 'No expenses match in ' : 'No expenses yet in '}
          {monthLabel(month)}. Ticking a task linked to a budget line adds one here, or import a bank statement (CSV) or tap +.
        </p>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table expenses-table">
            <thead>
              <tr>
                <th className="col-project">Division</th>
                <th className="col-date">Date</th>
                <th className="col-task">Description</th>
                <th className="col-center">Method</th>
                <th className="col-center">Type</th>
                <th className="col-center">Group</th>
                <th>Category</th>
                <th className="col-amount">Total</th>
                <th className="col-amount">GST/HST</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                  <td className="col-project">{e.project ? <span className="chip" style={{ ['--chip' as string]: projectForDivision(p.projects ?? [], e.project)?.color }}>{e.project}</span> : <span className="chip chip-empty">—</span>}</td>
                  <td className="col-date">{dayLabel(e.date)}</td>
                  <td className="col-task">
                    <button type="button" className="task-name" onClick={() => setEditing(e)} title={lineName(e.budgetLineId) ? `Paid from the budget line ${lineName(e.budgetLineId)}` : undefined}>
                      {e.description || '(no description)'}
                      {e.budgetLineId && <span className="expense-link" aria-label="linked to a budget line"> $$$</span>}
                    </button>
                  </td>
                  <td className="col-center">{e.method}</td>
                  <td className="col-center">{e.type && <span className={`status${e.type === 'FIXED' ? ' status-three' : ''}`}>{e.type}</span>}</td>
                  <td className="col-center">{e.category}</td>
                  <td>{e.pmtCategory}</td>
                  <td className="col-amount">
                    {e.amount === null ? '' : money(e.amount)}
                    {originalLabel(e) && <span className="money-orig">{originalLabel(e)}</span>}
                  </td>
                  <td className="col-amount">{e.gst === null ? '' : money(e.gst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!editing} title={editing && p.expenses.some((e) => e.id === editing.id) ? 'Edit expense' : 'Add expense'} onClose={() => setEditing(null)} wide>
        {editing && (
          <ExpenseForm
            key={editing.id}
            expense={editing}
            isNew={!p.expenses.some((e) => e.id === editing.id)}
            lineName={lineName(editing.budgetLineId)}
            projects={picks((x) => x.project)}
            methods={picks((x) => x.method)}
            pmtCategories={picks((x) => x.pmtCategory)}
            onSave={async (e) => {
              await p.onSave(e);
              setMonth(monthKey(e.date));
              setEditing(null);
            }}
            onDelete={async (id) => {
              await p.onDelete(id);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function ExpenseForm({
  expense,
  isNew,
  lineName,
  projects,
  methods,
  pmtCategories,
  onSave,
  onDelete
}: {
  expense: Expense;
  isNew: boolean;
  lineName?: string;
  projects: string[];
  methods: string[];
  pmtCategories: string[];
  onSave: (e: Expense) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState(expense);
  const [err, setErr] = useState('');
  const formId = useId();
  const set = (patch: Partial<Expense>) => setD((x) => ({ ...x, ...patch }));
  const cats = [...new Set([...BUDGET_CATEGORIES, d.category].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const types = [...new Set([...PMT_TYPES, d.type].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return (
    <form
      id={formId}
      className="task-form budget-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.date) return;
        setErr('');
        let m = { amount: d.amount, foreign: d.foreign ?? null, currency: d.currency || 'CAD' };
        try {
          m = await settleMoney(m);
        } catch (x) {
          return setErr(x instanceof Error ? x.message : 'No rate right now.');
        }
        onSave({ ...d, amount: m.amount, description: d.description.trim(), project: d.project.trim(), method: d.method.trim(), pmtCategory: d.pmtCategory.trim().toUpperCase(), notes: d.notes.trim() });
      }}
    >
      {lineName && <p className="panel-empty expense-from">Paid from the budget line <strong>{lineName}</strong>. For a fixed line, a new total here updates the budget too.</p>}
      <div className="budget-grid">
        <div className="field">
          <span>Division</span>
          <TitleCombo value={d.project} titles={projects} required={false} placeholder="APP SHOP" onChange={(project) => set({ project })} list="budget:project" />
        </div>
        <label className="field">
          <span>Date</span>
          <input type="date" required value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field budget-wide">
          <span>Description</span>
          <input value={d.description} autoFocus={isNew} placeholder="Direct Energy - Office / Studio Power" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <MoneyField label="Total" value={{ amount: d.amount, foreign: d.foreign ?? null, currency: d.currency || 'CAD' }} onChange={(m) => set({ amount: m.amount, foreign: m.currency === 'CAD' ? null : m.foreign, currency: m.currency === 'CAD' ? '' : m.currency })} />
        <label className="field">
          <span>GST/HST ($)</span>
          <AmountInput label="GST/HST" value={d.gst} onChange={(gst) => set({ gst })} />
        </label>
        <div className="field">
          <span>Pmt method</span>
          <TitleCombo value={d.method} titles={methods} required={false} placeholder="ATB P." onChange={(method) => set({ method })} list="budget:method" />
        </div>
        <label className="field">
          <span>Pmt type</span>
          <select value={d.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">—</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Budget group</span>
          <select value={d.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Payment category</span>
          <TitleCombo value={d.pmtCategory} titles={pmtCategories} required={false} placeholder="RENT" onChange={(pmtCategory) => set({ pmtCategory })} list="budget:pmt" />
        </div>
        <label className="field budget-wide">
          <span>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      {err && <p className="field-hint budget-over">{err}</p>}
      <FormActions formId={formId} saveDisabled={!d.date} onDelete={isNew ? undefined : () => onDelete(d.id)} deleteLabel="this expense" />
    </form>
  );
}
