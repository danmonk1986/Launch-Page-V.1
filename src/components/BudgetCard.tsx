import { useState } from 'react';
import { Icon } from './Tasks';
import { monthlyByCategory, money, type BudgetLine } from '../lib/budget';
import type { Project } from '../lib/projects';
import type { Expense } from '../lib/expenses';
import { nextRepeat, readRepeat, repeatOn } from '../lib/repeat';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';
import { booksWeek } from './BooksCards';

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
export function BudgetCard({ wide, onBuild, lines, today, month, onOpenAll, onOpenLine, onAdd, projects: projectList = [], lost = [], onKeep, onSkip, onRemove, choicesFor, onTie }: { /** V20-527 (Books): Type / Group / Category columns too. */ wide?: boolean; /** V20-507 (Books): an empty Budget says how it fills, and opens the Budget Audit. */ onBuild?: () => void; lines: BudgetLine[]; today: Date; month?: string; onOpenAll: () => void; onOpenLine?: (id: string) => void; onAdd?: () => void; projects?: Project[]; /** V20-483 (Books): bills due this month the bank never charged. */ lost?: BudgetLine[]; onKeep?: (id: string) => void; onSkip?: (id: string) => void; onRemove?: (id: string) => void; /** V20-487: the month's charges a lost bill could be. */ choicesFor?: (l: BudgetLine) => Expense[]; onTie?: (lineId: string, expenseId: string) => void }) {
  // V20-423 (Dan, Nov 20): the project is a coloured pill, like the Tasks card and the Budget page (same matching).
  const norm = (x: string) => x.toUpperCase().replace(/^STARDVST\s+/, '').replace(/[^A-Z0-9]/g, '');
  const projectFor = (name: string) => {
    const n = norm(name);
    if (!n) return undefined;
    return projectList.find((x) => norm(x.name) === n) ?? projectList.find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
  };
  const { q } = useHeaderSearch();
  // V20-486 (Dan, Nov 23, Books): the division boxes are filters; everything shows until you pick one.
  const [div, setDiv] = useState<string | null>(null);
  const perProject = monthlyByCategory(lines, 'project');
  const monthly = Object.values(perProject).reduce((a, x) => a + x, 0);
  const projects = Object.keys(perProject)
    .filter((k) => perProject[k])
    .sort((a, b) => perProject[b] - perProject[a]);
  const from = iso(today);
  const to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 12));
  const mStart = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12) : null;
  // V20-466 (Dan, Nov 23): one week, like the Launch Page: this month = Next 7 days from today; other months = 1st – 7th.
  const wk = month ? booksWeek(month, true) : null;
  const inMonth = (l: BudgetLine): { l: BudgetLine; next: string }[] => {
    const r = readRepeat(l.repeat ?? null);
    if (r.kind === 'none') return l.date && l.date >= wk!.from && l.date <= wk!.to ? [{ l, next: l.date }] : [];
    const out: { l: BudgetLine; next: string }[] = [];
    const start = new Date(`${wk!.from}T12:00:00`);
    for (let d = start; iso(d) <= wk!.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) if (repeatOn(r, d)) out.push({ l, next: iso(d) });
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
    .filter((x) => (div === null || x.l.project === div) && matchesSearch(q, x.l.description, x.l.project, x.l.notes))
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
          {month ? (
            <>
              <button type="button" className="budget-stat budget-stat-total" aria-pressed={div === null} title="Every division" onClick={() => setDiv(null)}>
                <span className="budget-stat-label">Monthly · by project</span>
                <span className="budget-stat-value">{money(monthly)}</span>
              </button>
              {projects.map((k) => (
                <button key={k} type="button" className="budget-stat" aria-pressed={div === k} title={div === k ? 'Show every division' : `Show only ${k}`} onClick={() => setDiv(div === k ? null : k)}>
                  <span className="budget-stat-label">{k}</span>
                  <span className="budget-stat-value">{money(perProject[k])}</span>
                </button>
              ))}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
      <h3 className="card-h">
        {wk && wk.label !== 'Next 7 days' ? `Due ${wk.label}` : 'Next 7 days'} · {due.length} · {money(dueTotal)}
      </h3>
      {due.length === 0 && onBuild && !lines.length ? (
        <div className="bc-empty-build">
          <p className="field-hint">Your budget builds itself from your expenses. Add or import some (set each one Fixed or Variable), then the Audit turns every Fixed charge into a budget line.</p>
          <button type="button" className="btn btn-go" onClick={onBuild}>
            Build it from my expenses
          </button>
        </div>
      ) : due.length === 0 ? (
        <p className="field-hint">{wk && wk.label !== 'Next 7 days' ? `Nothing due ${wk.label}.` : 'Nothing due in the next 7 days.'}</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Due in the next 7 days">
          {/* V20-422: column headers, like the Tasks card. */}
          <div className={`bc-row bc-head${wide ? ' books-wide bw-bud' : ''}`} role="row">
            <span role="columnheader" className="c-date">Date</span>
            <span role="columnheader" className="c-name">Line item</span>
            <span role="columnheader" className="c-div">Project</span>
            {wide && <span role="columnheader" className="c-x">Type</span>}
            {wide && <span role="columnheader" className="c-x">Group</span>}
            {wide && <span role="columnheader" className="c-x">Category</span>}
            <span role="columnheader" className="c-meth">Method</span>
            <span role="columnheader" className="c-amt bc-amt">Amount</span>
          </div>
          {due.map(({ l, next }, i) => (
            // V20-269 (Dan, Nov 15): a row opens its line's Edit line on the Budget page.
            <button
              type="button"
              key={`${l.id}|${next}`}
              className={`bc-row bc-row-btn${wide ? ' books-wide bw-bud' : ''}${i % 2 ? ' is-alt' : ''}`}
              role="row"
              title={`Edit ${l.description}`}
              onClick={() => (onOpenLine ? onOpenLine(l.id) : onOpenAll())}
            >
              <span className="c-date pl-mono pl-due">{day(next)}</span>
              <span className="c-name pl-name bc-name">{l.description}</span>
              <span className="c-div pl-desc bc-proj">
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
              {wide && <span className="c-x pl-desc">{l.type || '—'}</span>}
              {wide && <span className="c-x pl-desc">{l.category || '—'}</span>}
              {wide && <span className="c-x pl-desc">{l.pmtCategory || '—'}</span>}
              <span className="c-meth pl-desc">{l.method}</span>
              <span className="c-amt pl-mono bc-amt">{l.amount === null ? '—' : money(l.amount)}</span>
            </button>
          ))}
        </div>
      )}
      {/* V20-483 (Dan, Nov 23, Books): a bill that should have been charged but wasn't (e.g. a cancelled subscription)
          is a lost budget item: keep it (stop asking), skip this month, or remove it from the Budget. */}
      {(lost = lost.filter((l) => div === null || l.project === div)).length > 0 && month && (
        <div className="bc-lost">
          <h3 className="card-h">
            Not charged in {new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12).toLocaleDateString('en-US', { month: 'long' })} · {lost.length} · {money(lost.reduce((a, l) => a + (l.amount ?? 0), 0))}
          </h3>
          <p className="field-hint">These bills are in your Budget, but the bank shows no charge for them this month. Still paying it? Keep it. Cancelled? Remove it.</p>
          {lost.map((l) => (
            <div key={l.id} className="bc-lost-row">
              <span className="pl-desc">{l.description}</span>
              <span className="pl-mono bc-amt">{l.amount === null ? '—' : money(l.amount)}</span>
              <span className="bc-lost-acts">
                {choicesFor && onTie && (
                  <select
                    className="bc-lost-find"
                    value=""
                    aria-label={`Find the charge for ${l.description}`}
                    title="It was charged under another name (e.g. your Apple ID): pick the expense it was"
                    onChange={(e) => e.target.value && onTie(l.id, e.target.value)}
                  >
                    <option value="">Find the charge…</option>
                    {choicesFor(l).map((x) => (
                      <option key={x.id} value={x.id}>
                        {new Date(`${x.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {x.description || '—'} · {money(x.amount ?? 0)}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn btn-quiet" onClick={() => onKeep?.(l.id)} title="It's still a bill (charged under another name, or not every month): stop asking">
                  Keep
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => onSkip?.(l.id)} title="Not this month only">
                  Skip this month
                </button>
                <RemoveBtn onRemove={() => onRemove?.(l.id)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Two taps to remove (no pop-up): Remove → Sure? */
function RemoveBtn({ onRemove }: { onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className={`btn ${sure ? '' : 'btn-quiet'}`} onClick={() => (sure ? onRemove() : setSure(true))} onBlur={() => setSure(false)} title="Take it out of your Budget">
      {sure ? 'Sure? Remove' : 'Remove'}
    </button>
  );
}
