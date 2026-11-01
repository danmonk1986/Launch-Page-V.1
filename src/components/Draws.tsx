import { useMemo, useState } from 'react';
import { money } from '../lib/budget';
import { fyOf, fyRange, type Draw } from '../lib/bank';
import { dayLabel } from './Expenses';
import { Icon } from './Tasks';

const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';
const today = () => new Date().toLocaleDateString('en-CA');

/** Records → Draws (V20-015): business withdrawals and e-transfers to the owner, a fiscal year at a time. */
export const thisFy = (fyEnd: string) => fyOf(today(), fyEnd);

/** ‹ FY2027 › — tap the year to come back to this one. */
export function FyNav({ fy, fyEnd, onChange }: { fy: number; fyEnd: string; onChange: (fy: number) => void }) {
  const range = fyRange(fy, fyEnd);
  return (
    <div className="d26-range month-nav" role="group" aria-label="Fiscal year">
      <button type="button" aria-label="Previous fiscal year" onClick={() => onChange(fy - 1)}>
        ‹
      </button>
      <button type="button" aria-pressed="true" title={`${range.from} – ${range.to}. Tap for this year.`} onClick={() => onChange(thisFy(fyEnd))}>
        FY{fy}
      </button>
      <button type="button" aria-label="Next fiscal year" onClick={() => onChange(fy + 1)}>
        ›
      </button>
    </div>
  );
}

export function DrawsView(p: { draws: Draw[]; fy: number; fyEnd: string; search: string; onSave: (d: Draw) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const { fy } = p;
  const range = fyRange(fy, p.fyEnd);
  const needle = p.search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      p.draws
        .filter((d) => d.date >= range.from && d.date <= range.to)
        .filter((d) => !needle || [d.description, d.project, d.notes, String(d.amount)].some((v) => v.toLowerCase().includes(needle)))
        .sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort),
    [p.draws, range.from, range.to, needle]
  );
  const total = rows.reduce((a, d) => a + d.amount, 0);
  const byMonth = rows.reduce<Record<string, number>>((m, d) => ((m[d.date.slice(0, 7)] = (m[d.date.slice(0, 7)] ?? 0) + d.amount), m), {});
  const [draft, setDraft] = useState<Record<string, Partial<Draw>>>({});
  const field = (d: Draw, k: 'project' | 'description' | 'notes') => (
    <input
      value={(draft[d.id]?.[k] as string | undefined) ?? d[k]}
      onChange={(e) => setDraft((m) => ({ ...m, [d.id]: { ...m[d.id], [k]: e.target.value } }))}
      onBlur={() => {
        const v = draft[d.id]?.[k];
        if (v !== undefined && v !== d[k]) void p.onSave({ ...d, [k]: v });
      }}
      aria-label={k}
      className="bank-desc"
    />
  );

  return (
    <div className="expenses">
      <div className="budget-stats" aria-label="Draws this fiscal year">
        <div className="budget-stat budget-stat-total">
          <span className="budget-stat-label">Draws · FY{fy}</span>
          <span className="budget-stat-value">{money(total)}</span>
        </div>
        {Object.keys(byMonth)
          .sort()
          .map((m) => (
            <div key={m} className="budget-stat">
              <span className="budget-stat-label">{dayLabel(`${m}-01`).split(' ')[0]}</span>
              <span className="budget-stat-value">{money(byMonth[m])}</span>
            </div>
          ))}
      </div>
      {rows.length === 0 ? (
        <p className="panel-empty">No draws in FY{fy} yet. Import a business account statement (Import CSV) and its e-transfers to you land here.</p>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table expenses-table">
            <thead>
              <tr>
                <th className="col-project">Division</th>
                <th className="col-date">Date</th>
                <th className="col-task">Description</th>
                <th className="col-amount">Transferred</th>
                <th>Notes</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={d.id} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                  <td className="col-project">{field(d, 'project')}</td>
                  <td className="col-date">{dayLabel(d.date)}</td>
                  <td className="col-task">{field(d, 'description')}</td>
                  <td className="col-amount">{money(d.amount)}</td>
                  <td>{field(d, 'notes')}</td>
                  <td className="col-actions">
                    <button type="button" className="icon-btn" aria-label={`Delete ${d.description}`} title="Delete" onClick={() => void p.onDelete(d.id)}>
                      <Icon d={TRASH} size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
