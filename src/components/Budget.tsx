import { useId, useMemo, useRef, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { TitleCombo } from './Launchers';
import type { Project } from '../lib/projects';
import {
  BUDGET_CATEGORIES,
  BUDGET_SECTIONS,
  GROUP_BY,
  groupKey,
  PMT_TYPES,
  download,
  linesFromFile,
  linesToCsv,
  money,
  monthlyByCategory,
  newBudgetLine,
  sumLines,
  type BudgetGroupBy,
  type BudgetLine,
  type BudgetSection
} from '../lib/budget';

const PLUS = 'M12 5v14M5 12h14';
const CLOSE = 'M6 6l12 12M18 6L6 18';
// One square button cycles the totals: layers (group), a list (pmt category), a folder (project), four boxes (budget category).
const GROUP_ICON: Record<BudgetGroupBy, string> = {
  section: 'M12 3 2 8l10 5 10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
  pmtCategory: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  category: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
};
const IMPORT = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const EXPORT = 'M12 15V3M7 8l5-5 5 5M5 21h14';

type Props = {
  lines: BudgetLine[];
  projects: Project[];
  onSave: (l: BudgetLine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReplace: (lines: BudgetLine[]) => Promise<void>;
  onClose: () => void;
};

const norm = (s: string) => s.toLowerCase().replace(/^stardvst\s+/, '').replace(/[^a-z0-9]/g, '');

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Budget V.1: the Launch Sheet's BUDGET tab, laid out like the task list. */
export function BudgetPage(p: Props) {
  // The box clicked: shows only its lines. null = everything.
  const [pick, setPick] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [incoming, setIncoming] = useState<{ name: string; lines: BudgetLine[] } | null>(null);
  const [importError, setImportError] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const bySection = useMemo(() => {
    const g = {} as Record<BudgetSection, BudgetLine[]>;
    for (const s of BUDGET_SECTIONS) g[s.id] = p.lines.filter((l) => l.section === s.id).sort((a, b) => a.sort - b.sort);
    return g;
  }, [p.lines]);
  const [groupBy, setGroupByState] = useState<BudgetGroupBy>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.groupBy');
      return GROUP_BY.some((g) => g.id === v) ? (v as BudgetGroupBy) : 'section';
    } catch {
      return 'section';
    }
  });
  const setGroupBy = (g: BudgetGroupBy) => {
    setGroupByState(g);
    setPick(null);
    try {
      localStorage.setItem('launchpage.budget.groupBy', g);
    } catch {
      /* ignore */
    }
  };
  const gi = GROUP_BY.findIndex((g) => g.id === groupBy);
  const groupLabel = GROUP_BY[gi].label.toLowerCase();
  const nextGroup = GROUP_BY[(gi + 1) % GROUP_BY.length].id;
  const nextLabel = GROUP_BY[(gi + 1) % GROUP_BY.length].label.toLowerCase();
  const perCat = monthlyByCategory(p.lines, groupBy);
  const monthly = Object.values(perCat).reduce((a, x) => a + x, 0);
  // Budget categories keep the sheet's column order; the others go biggest first.
  const cats =
    groupBy === 'section'
      ? BUDGET_SECTIONS.map((x) => x.id as string).filter((id) => bySection[id as BudgetSection].length)
      : groupBy === 'category'
      ? [...BUDGET_CATEGORIES.filter((c) => perCat[c]), ...Object.keys(perCat).filter((c) => !BUDGET_CATEGORIES.includes(c) && perCat[c])]
      : Object.keys(perCat)
          .filter((c) => perCat[c])
          .sort((a, b) => perCat[b] - perCat[a]);

  // The sheet's project name as one of your Projects (exact first, then "DAN MONK" ≈ "DANMONK26"), like Tasks shows them.
  const projectFor = (name: string) => {
    const n = norm(name);
    if (!n) return undefined;
    return p.projects.find((x) => norm(x.name) === n) ?? p.projects.find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)));
  };
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const readFile = async (f: File) => {
    setImportError('');
    try {
      const lines = linesFromFile(f.name, await f.text());
      if (!lines.length) throw new Error('No budget lines found in that file.');
      setIncoming({ name: f.name, lines });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'That file could not be read.');
      setIncoming({ name: f.name, lines: [] });
    }
  };

  const shows = (l: BudgetLine) => pick === null || groupKey(l, groupBy) === pick;
  const sections = BUDGET_SECTIONS.map((s) => s.id).filter((id) => pick === null || bySection[id].some(shows));
  const boxLabel = (c: string) => {
    if (groupBy !== 'section') return c;
    const t = BUDGET_SECTIONS.find((x) => x.id === c)?.title ?? c;
    return c === 'annual' ? `${t} ÷ 12` : c === 'planned' ? `${t} · not in monthly` : t;
  };
  const boxValue = (c: string) => (groupBy === 'section' && c === 'planned' ? sumLines(bySection.planned) : perCat[c] ?? 0);

  return (
    <section className="panel panel-tasks-page panel-budget" aria-labelledby="h-budget">
      <div className="panel-head">
        <h2 id="h-budget" className="panel-title">
          Budget
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Add a line" title="Add a line" onClick={() => setEditing(newBudgetLine(groupBy === 'section' && pick ? (pick as BudgetSection) : 'variable', p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0)))}>
            <Icon d={PLUS} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Import" title="Import the BUDGET tab (CSV) or a JSON file" onClick={() => file.current?.click()}>
            <Icon d={IMPORT} />
          </button>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Export CSV"
            title="Export as CSV (opens in Google Sheets; imports back in here)"
            disabled={!p.lines.length}
            onClick={() => download(`launchpage-budget-${new Date().toISOString().slice(0, 10)}.csv`, linesToCsv(p.lines), 'text/csv')}
          >
            <Icon d={EXPORT} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={p.onClose}>
            <Icon d={CLOSE} />
          </button>
          <input
            ref={file}
            type="file"
            accept=".csv,.json,.txt,text/csv,application/json,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readFile(f);
            }}
          />
        </div>
      </div>

      {p.lines.length > 0 && (
        <div className="budget-stats" aria-label="A month of spending">
          <button
            type="button"
            className="icon-btn tool-btn budget-groupby"
            aria-label={`Monthly totals by ${groupLabel}. Switch to ${nextLabel}`}
            title={`By ${groupLabel} · tap for ${nextLabel}`}
            onClick={() => setGroupBy(nextGroup)}
          >
            <Icon d={GROUP_ICON[groupBy]} size={18} />
          </button>
          <button type="button" className="budget-stat budget-stat-total" aria-pressed={pick === null} title="Everything · fixed + variable + annual ÷ 12" onClick={() => setPick(null)}>
            <span className="budget-stat-label">Monthly · by {groupLabel}</span>
            <span className="budget-stat-value">{money(monthly)}</span>
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className="budget-stat" aria-pressed={pick === c} title={pick === c ? 'Show everything' : `Show only ${boxLabel(c)}`} onClick={() => setPick(pick === c ? null : c)}>
              <span className="budget-stat-label">{boxLabel(c)}</span>
              <span className="budget-stat-value">{money(boxValue(c))}</span>
            </button>
          ))}
        </div>
      )}

      {p.lines.length === 0 ? (
        <div className="budget-empty">
          <p className="panel-empty">
            No budget yet. In the Launch Sheet, open the <strong>BUDGET</strong> tab, then <strong>File → Download → Comma-separated values (.csv)</strong>, and import that file here.
          </p>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Import the BUDGET tab
          </button>
        </div>
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table">
            <thead>
              <tr>
                <th className="col-project">Project</th>
                <th className="col-date">Date</th>
                <th className="col-task">Description</th>
                <th className="col-center">Method</th>
                <th className="col-center">Type</th>
                <th className="col-center">Category</th>
                <th>Pmt category</th>
                <th className="col-amount">Amount</th>
                <th className="col-notes">Notes</th>
              </tr>
            </thead>
            {sections.map((id) => {
              const s = BUDGET_SECTIONS.find((x) => x.id === id)!;
              const rows = bySection[id].filter(shows);
              const shut = !(groupBy === 'section' && pick) && closed[id];
              return (
                <tbody key={id}>
                  <tr className="task-section">
                    <th colSpan={7} scope="rowgroup">
                      <button type="button" className="section-btn" aria-expanded={!shut} onClick={() => setClosed((c) => ({ ...c, [id]: !c[id] }))}>
                        <span className="section-caret" aria-hidden="true">
                          {shut ? '›' : '⌄'}
                        </span>
                        {s.title} <span className="section-count">{rows.length}</span>
                      </button>
                    </th>
                    <th className="col-amount budget-subtotal">{money(sumLines(rows))}</th>
                    <th />
                  </tr>
                  {!shut && rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="task-empty">
                        Nothing here.
                      </td>
                    </tr>
                  )}
                  {!shut &&
                    rows.map((l, i) => (
                      <tr key={l.id} className={`task-row${i % 2 ? ' is-alt' : ''}`}>
                        <td className="col-project">
                          {l.project ? (
                            (() => {
                              const pr = projectFor(l.project);
                              return (
                                <span className="chip" style={pr ? { ['--chip' as string]: pr.color } : undefined} title={l.project}>
                                  {pr ? pr.name.replace(/^STARDVST\s+/i, '') : l.project}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="chip chip-empty">—</span>
                          )}
                        </td>
                        <td className="col-date">{shortDate(l.date)}</td>
                        <td className="col-task">
                          <button type="button" className="task-name" onClick={() => setEditing(l)}>
                            {l.description}
                          </button>
                        </td>
                        <td className="col-center">{l.method}</td>
                        <td className="col-center">{l.type && <span className={`status${l.type === 'FIXED' ? ' status-three' : ''}`}>{l.type}</span>}</td>
                        <td className="col-center">{l.category}</td>
                        <td>{l.pmtCategory}</td>
                        <td className="col-amount">{l.amount === null ? '' : money(l.amount)}</td>
                        <td className="col-notes" title={l.notes}>
                          {l.notes}
                        </td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <Sheet open={!!editing} title={editing && p.lines.some((l) => l.id === editing.id) ? 'Edit line' : 'Add a line'} onClose={() => setEditing(null)} wide>
        {editing && (
          <LineForm
            key={editing.id}
            line={editing}
            isNew={!p.lines.some((l) => l.id === editing.id)}
            projects={[...new Set([...picks((l) => l.project), ...p.projects.map((x) => x.name.replace(/^STARDVST\s+/i, ''))])].sort((a, b) => a.localeCompare(b))}
            methods={picks((l) => l.method)}
            pmtCategories={picks((l) => l.pmtCategory)}
            onSave={async (l) => {
              await p.onSave(l);
              setEditing(null);
            }}
            onDelete={async (id) => {
              await p.onDelete(id);
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!incoming} title="Import budget" onClose={() => setIncoming(null)}>
        {incoming && (
          <div className="reminder">
            {importError ? (
              <p className="panel-empty">
                <strong>{incoming.name}</strong>: {importError}
              </p>
            ) : (
              <>
                <p className="panel-empty">
                  <strong>{incoming.name}</strong> has {incoming.lines.length} lines:{' '}
                  {BUDGET_SECTIONS.map((s) => `${incoming.lines.filter((l) => l.section === s.id).length} ${s.title.toLowerCase()}`).join(', ')}.
                  {p.lines.length > 0 && ` You have ${p.lines.length} lines now.`}
                </p>
                <div className="reminder-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setIncoming(null)}>
                    Cancel
                  </button>
                  {p.lines.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={async () => {
                        const base = p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0);
                        const add = incoming.lines.map((l, i) => ({ ...l, sort: base + i }));
                        setIncoming(null);
                        await p.onReplace([...p.lines, ...add]);
                      }}
                    >
                      Add to it
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const next = incoming.lines;
                      setIncoming(null);
                      await p.onReplace(next);
                    }}
                  >
                    {p.lines.length ? 'Replace my budget' : 'Import'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}

function LineForm({
  line,
  isNew,
  projects,
  methods,
  pmtCategories,
  onSave,
  onDelete
}: {
  line: BudgetLine;
  isNew: boolean;
  projects: string[];
  methods: string[];
  pmtCategories: string[];
  onSave: (l: BudgetLine) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState(line);
  const formId = useId();
  const set = (patch: Partial<BudgetLine>) => setD((x) => ({ ...x, ...patch }));
  const cats = [...new Set([...BUDGET_CATEGORIES, d.category].filter(Boolean))];
  const types = [...new Set([...PMT_TYPES, d.type].filter(Boolean))];
  return (
    <form
      id={formId}
      className="task-form budget-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.description.trim()) onSave({ ...d, description: d.description.trim(), project: d.project.trim(), method: d.method.trim(), pmtCategory: d.pmtCategory.trim().toUpperCase(), notes: d.notes.trim() });
      }}
    >
      <div className="budget-grid">
        <label className="field">
          <span>Group</span>
          <select value={d.section} onChange={(e) => set({ section: e.target.value as BudgetSection })}>
            {BUDGET_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Project</span>
          <TitleCombo value={d.project} titles={projects} required={false} placeholder="APP SHOP" onChange={(project) => set({ project })} />
        </div>
        <label className="field budget-wide">
          <span>Description</span>
          <input value={d.description} autoFocus={isNew} required placeholder="Minto International Rent" onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="field">
          <span>Amount ($)</span>
          <input type="number" inputMode="decimal" step="any" value={d.amount ?? ''} onChange={(e) => set({ amount: e.target.value === '' ? null : Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={d.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />
        </label>
        <div className="field">
          <span>Pmt method</span>
          <TitleCombo value={d.method} titles={methods} required={false} placeholder="ATB" onChange={(method) => set({ method })} />
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
          <span>Budget category</span>
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
          <TitleCombo value={d.pmtCategory} titles={pmtCategories} required={false} placeholder="RENT" onChange={(pmtCategory) => set({ pmtCategory })} />
        </div>
        <label className="field budget-wide">
          <span>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
      <FormActions formId={formId} saveDisabled={!d.description.trim()} onDelete={isNew ? undefined : () => onDelete(d.id)} deleteLabel="this line" />
    </form>
  );
}
