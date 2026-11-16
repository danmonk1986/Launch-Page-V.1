import { Icon } from './Tasks';
import { monthlyByCategory, money, type BudgetLine } from '../lib/budget';
import { nextRepeat, readRepeat } from '../lib/repeat';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';

/**
 * V20-249 (Dan, Nov 14): the Budget card on the Launch Page, like the Tasks card. The month's totals by project
 * (as on the Budget page), then what's due in the next 7 days. ⌄ opens the full Budget, which left the menu.
 */
const CHEV = 'M6 9l6 6 6-6';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function BudgetCard({ lines, today, onOpenAll, onOpenLine }: { lines: BudgetLine[]; today: Date; onOpenAll: () => void; onOpenLine?: (id: string) => void }) {
  const { q } = useHeaderSearch();
  const perProject = monthlyByCategory(lines, 'project');
  const monthly = Object.values(perProject).reduce((a, x) => a + x, 0);
  const projects = Object.keys(perProject)
    .filter((k) => perProject[k])
    .sort((a, b) => perProject[b] - perProject[a]);
  const from = iso(today);
  const to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 12));
  const due = lines
    .map((l) => {
      const r = readRepeat(l.repeat ?? null);
      const next = r.kind !== 'none' ? nextRepeat(r, today) : l.date;
      return { l, next };
    })
    .filter((x): x is { l: BudgetLine; next: string } => !!x.next && x.next >= from && x.next <= to)
    .filter((x) => matchesSearch(q, x.l.description, x.l.project, x.l.notes))
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : (b.l.amount ?? 0) - (a.l.amount ?? 0)));
  const dueTotal = due.reduce((a, x) => a + (x.l.amount ?? 0), 0);
  const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <section className="panel panel-budget-card" aria-labelledby="h-budget-card">
      <div className="panel-head">
        <div className="rockets-title">
          <h2 id="h-budget-card" className="panel-title">
            Budget
          </h2>
          <button type="button" className="rockets-toggle" aria-label="Open the full Budget" title="Open the full Budget" onClick={onOpenAll}>
            <Icon d={CHEV} />
          </button>
        </div>
      </div>
      {lines.length > 0 && (
        <div className="budget-stats" aria-label="A month of spending">
          <div className="budget-stat budget-stat-total" aria-pressed="true">
            <span className="budget-stat-label">Monthly · by project</span>
            <span className="budget-stat-value">{money(monthly)}</span>
          </div>
          {projects.map((k) => (
            <div key={k} className="budget-stat">
              <span className="budget-stat-label">{k}</span>
              <span className="budget-stat-value">{money(perProject[k])}</span>
            </div>
          ))}
        </div>
      )}
      <h3 className="card-h">
        Next 7 days · {due.length} · {money(dueTotal)}
      </h3>
      {due.length === 0 ? (
        <p className="field-hint">Nothing due in the next 7 days.</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Due in the next 7 days">
          {due.map(({ l, next }, i) => (
            // V20-269 (Dan, Nov 15): a row opens its line's Edit line on the Budget page.
            <button
              type="button"
              key={l.id}
              className={`bc-row bc-row-btn${i % 2 ? ' is-alt' : ''}`}
              role="row"
              title={`Edit ${l.description}`}
              onClick={() => (onOpenLine ? onOpenLine(l.id) : onOpenAll())}
            >
              <span className="pl-mono pl-due">{day(next)}</span>
              <span className="pl-name bc-name">{l.description}</span>
              <span className="pl-desc">{l.project}</span>
              <span className="pl-desc">{l.method}</span>
              <span className="pl-mono bc-amt">{l.amount === null ? '—' : money(l.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
