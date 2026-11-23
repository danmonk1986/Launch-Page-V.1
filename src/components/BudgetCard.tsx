import { Icon } from './Tasks';
import { monthlyByCategory, money, type BudgetLine } from '../lib/budget';
import type { Project } from '../lib/projects';
import { nextRepeat, readRepeat, repeatOn } from '../lib/repeat';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';

/**
 * V20-249 (Dan, Nov 14): the Budget card on the Launch Page, like the Tasks card. The month's totals by project
 * (as on the Budget page), then what's due in the next 7 days. ⌄ opens the full Budget, which left the menu.
 */
const CHEV = 'M6 9l6 6 6-6';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * V20-465 (Dan, Nov 23): on Books, `month` (YYYY-MM, from the Cash Book's ‹ ›) swaps "Next 7 days" for everything
 * due in that month, so the Budget card follows the overview like Expenses and Income. Main passes no month.
 */
export function BudgetCard({ lines, today, month, onOpenAll, onOpenLine, onAdd, projects: projectList = [] }: { lines: BudgetLine[]; today: Date; month?: string; onOpenAll: () => void; onOpenLine?: (id: string) => void; onAdd?: () => void; projects?: Project[] }) {
  // V20-423 (Dan, Nov 20): the project is a coloured pill, like the Tasks card and the Budget page (same matching).
  const norm = (x: string) => x.toUpperCase().replace(/^STARDVST\s+/, '').replace(/[^A-Z0-9]/g, '');
  const projectFor = (name: string) => {
    const n = norm(name);
    if (!n) return undefined;
    return projectList.find((x) => norm(x.name) === n) ?? projectList.find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
  };
  const { q } = useHeaderSearch();
  const perProject = monthlyByCategory(lines, 'project');
  const monthly = Object.values(perProject).reduce((a, x) => a + x, 0);
  const projects = Object.keys(perProject)
    .filter((k) => perProject[k])
    .sort((a, b) => perProject[b] - perProject[a]);
  const from = iso(today);
  const to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 12));
  const mStart = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12) : null;
  const mName = mStart ? mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';
  const inMonth = (l: BudgetLine): { l: BudgetLine; next: string }[] => {
    const r = readRepeat(l.repeat ?? null);
    if (r.kind === 'none') return l.date && l.date.slice(0, 7) === month ? [{ l, next: l.date }] : [];
    const out: { l: BudgetLine; next: string }[] = [];
    for (let d = new Date(mStart!); d.getMonth() === mStart!.getMonth(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) if (repeatOn(r, d)) out.push({ l, next: iso(d) });
    return out;
  };
  const due = (mStart
    ? lines.flatMap(inMonth)
    : lines
        .map((l) => {
          const r = readRepeat(l.repeat ?? null);
          const next = r.kind !== 'none' ? nextRepeat(r, today) : l.date;
          return { l, next };
        })
        .filter((x): x is { l: BudgetLine; next: string } => !!x.next && x.next >= from && x.next <= to))
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
        {/* V20-422 (Dan, Nov 20): + adds a budget line, like the Tasks card's +. */}
        {onAdd && (
          <div className="panel-actions">
            <button type="button" className="icon-btn tool-btn" aria-label="Add a budget line" title="Add a budget line" onClick={onAdd}>
              <Icon d="M12 5v14M5 12h14" />
            </button>
          </div>
        )}
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
        {mStart ? `Due in ${mName}` : 'Next 7 days'} · {due.length} · {money(dueTotal)}
      </h3>
      {due.length === 0 ? (
        <p className="field-hint">{mStart ? `Nothing due in ${mName}.` : 'Nothing due in the next 7 days.'}</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Due in the next 7 days">
          {/* V20-422: column headers, like the Tasks card. */}
          <div className="bc-row bc-head" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">Line item</span>
            <span role="columnheader">Project</span>
            <span role="columnheader">Method</span>
            <span role="columnheader" className="bc-amt">Amount</span>
          </div>
          {due.map(({ l, next }, i) => (
            // V20-269 (Dan, Nov 15): a row opens its line's Edit line on the Budget page.
            <button
              type="button"
              key={`${l.id}|${next}`}
              className={`bc-row bc-row-btn${i % 2 ? ' is-alt' : ''}`}
              role="row"
              title={`Edit ${l.description}`}
              onClick={() => (onOpenLine ? onOpenLine(l.id) : onOpenAll())}
            >
              <span className="pl-mono pl-due">{day(next)}</span>
              <span className="pl-name bc-name">{l.description}</span>
              <span className="pl-desc bc-proj">
                {l.project
                  ? (() => {
                      const pr = projectFor(l.project);
                      return (
                        <span className="chip" style={pr ? { ['--chip' as string]: pr.color } : undefined} title={l.project}>
                          {pr ? pr.name.replace(/^STARDVST\s+/i, '') : l.project}
                        </span>
                      );
                    })()
                  : null}
              </span>
              <span className="pl-desc">{l.method}</span>
              <span className="pl-mono bc-amt">{l.amount === null ? '—' : money(l.amount)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
