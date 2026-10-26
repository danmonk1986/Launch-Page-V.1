import { useId, useMemo, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { TitleCombo } from './Launchers';
import { BUDGET_CATEGORIES, PMT_TYPES, money, type BudgetLine } from '../lib/budget';
import { MONTHS } from '../lib/repeat';
import { monthKey, newExpense, type Expense } from '../lib/expenses';
import { MoneyField, settleMoney } from './MoneyField';
import { AmountInput } from './AmountInput';
import { originalLabel } from '../lib/currency';

const PLUS = 'M12 5v14M5 12h14';
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
};

/**
 * Expenses (LP-030): what was actually paid, a month at a time, in the Launch Sheet's
 * EXPENSES columns. Ticking a task linked to a budget line adds a row here.
 */
export function ExpensesView(p: Props) {
  const { month, onMonth: setMonth } = p;
  const [editing, setEditing] = useState<Expense | null>(null);
  const needle = p.search.trim().toLowerCase();

  const rows = useMemo(
    () =>
      p.expenses
        .filter((e) => monthKey(e.date) === month)
        .filter((e) => !needle || [e.description, e.project, e.method, e.type, e.category, e.pmtCategory, e.notes, e.amount === null ? '' : String(e.amount)].some((v) => v.toLowerCase().includes(needle)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort),
    [p.expenses, month, needle]
  );
  const total = rows.reduce((a, e) => a + (e.amount ?? 0), 0);
  const gst = rows.reduce((a, e) => a + (e.gst ?? 0), 0);
  // The sheet's per-category columns: TOTAL split by PMT CATEGORY.
  const byPmt = rows.reduce<Record<string, number>>((m, e) => {
    const k = e.pmtCategory.trim().toUpperCase() || 'OTHER';
    m[k] = (m[k] ?? 0) + (e.amount ?? 0);
    return m;
  }, {});
  const lineName = (id: string | null) => (id ? p.lines.find((l) => l.id === id)?.description : undefined);
  const picks = (f: (x: { project: string; method: string; pmtCategory: string }) => string) =>
    [...new Set([...p.expenses, ...p.lines].map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <div className="expenses">
      <div className="expenses-bar">
        <MonthNav month={month} onChange={setMonth} />
        <button
          type="button"
          className="btn btn-quiet expenses-add"
          onClick={() => {
            const today = iso(new Date());
            setEditing(newExpense(monthKey(today) === month ? today : `${month}-01`, p.expenses.reduce((m, e) => Math.max(m, e.sort + 1), 0)));
          }}
        >
          <Icon d={PLUS} size={16} /> Add expense
        </button>
      </div>

      <div className="budget-stats" aria-label="This month's expenses">
        <div className="budget-stat budget-stat-total">
          <span className="budget-stat-label">Spent · {monthLabel(month)}</span>
          <span className="budget-stat-value">{money(total)}</span>
        </div>
        {gst > 0 && (
          <div className="budget-stat">
            <span className="budget-stat-label">GST/HST</span>
            <span className="budget-stat-value">{money(gst)}</span>
          </div>
        )}
        {Object.keys(byPmt)
          .sort((a, b) => byPmt[b] - byPmt[a])
          .map((k) => (
            <div key={k} className="budget-stat">
              <span className="budget-stat-label">{k}</span>
              <span className="budget-stat-value">{money(byPmt[k])}</span>
            </div>
          ))}
      </div>

      {rows.length === 0 ? (
        <p className="panel-empty">
          {needle ? 'No expenses match in ' : 'No expenses yet in '}
          {monthLabel(month)}. Ticking a task linked to a budget line adds one here, or use Add expense.
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
                <th className="col-center">Category</th>
                <th>Pmt category</th>
                <th className="col-amount">Total</th>
                <th className="col-amount">GST/HST</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                  <td className="col-project">{e.project ? <span className="chip">{e.project}</span> : <span className="chip chip-empty">—</span>}</td>
                  <td className="col-date">{dayLabel(e.date)}</td>
                  <td className="col-task">
                    <button type="button" className="task-name" onClick={() => setEditing(e)} title={lineName(e.budgetLineId) ? `Paid from the budget line ${lineName(e.budgetLineId)}` : undefined}>
                      {e.description || '(no description)'}
                      {e.budgetLineId && <span className="expense-link" aria-label="linked to a budget line"> 🔗</span>}
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
  const cats = [...new Set([...BUDGET_CATEGORIES, d.category].filter(Boolean))];
  const types = [...new Set([...PMT_TYPES, d.type].filter(Boolean))];
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
          <span>Expense category</span>
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
          <span>Pmt category</span>
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
