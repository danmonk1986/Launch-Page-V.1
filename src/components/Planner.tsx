import { useId, useState, type KeyboardEvent } from 'react';
import { Icon } from './Tasks';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';
import { byDate, newDecision, DECISION_STATUSES, type Decision, type DecisionOption, type DecisionStatus } from '../lib/decisions';
import { pickLabel as projectPick, pickable, projectTree, type Project } from '../lib/projects';
import { newPlan, type Plan } from '../lib/plans';
import { Sheet, FormActions } from './Sheet';

/**
 * V20-247 (Dan, Nov 14): Project Planner · the List. One card on the Launch Page (Settings › Modules › Project
 * Planner). Pick a project in the pill; its decisions are sorted by date (undated at the bottom). Tap ⌄ on a row to
 * open it in place (as many as you like): options sit on the left like task steps, the decision on the right.
 * Board and Timeline come next (mocked up on the style guide canvas).
 */
const CHEV = 'M6 9l6 6 6-6';
const LEFT = 'M15 6l-6 6 6 6';
const RIGHT = 'M9 6l6 6-6 6';
const UP = 'M6 15l6-6 6 6';
const PLUS = 'M12 5v14M5 12h14';
const CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const X = 'M6 6l12 12M18 6L6 18';
const SAVE = 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6';
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';
const STATUS_COLOR: Record<DecisionStatus, string> = {
  open: 'var(--accent-purple)',
  deciding: 'var(--accent-teal)',
  waiting: '#c2338f',
  decided: 'var(--accent-teal)',
  done: '#3faf5a'
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PlannerPanel(p: {
  decisions: Decision[];
  /** V20-253: a project holds plans; a plan holds decisions. The pill steps through the plans. */
  plans: Plan[];
  projects: Project[];
  onSave: (d: Decision) => Promise<void>;
  onSaveMany: (d: Decision[]) => Promise<void>;
  onSavePlan: (p: Plan) => Promise<void>;
  /** V20-259: Workflow › Calendar / Task / Rocket. */
  onToCalendar: (d: Decision) => void;
  onToTask: (d: Decision) => void;
  onToRocket: (d: Decision) => void;
  onRemove: (id: string) => Promise<void>;
  /** V20-249: the card's ⌄ opens the planner full screen; ^ there comes back. */
  full?: boolean;
  onToggle?: () => void;
}) {
  const { q } = useHeaderSearch();
  const plans = [...p.plans].sort((a, b) => a.sort - b.sort);
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = plans.find((x) => x.id === planId) ?? plans[0] ?? null;
  const pid = plan?.projectId ?? null;
  const at = plan ? plans.indexOf(plan) : -1;
  const step = (by: number) => plans.length && setPlanId(plans[(at + by + plans.length) % plans.length].id);
  const [sheet, setSheet] = useState<{ plan: Plan; isNew: boolean } | null>(null);
  const [open, setOpen] = useState<Record<string, Decision>>({});
  const [ask, setAsk] = useState<string | null>(null);
  const list = p.decisions
    .filter((d) => !!plan && d.planId === plan.id)
    .filter((d) => matchesSearch(q, d.title, d.description, d.notes, ...d.options.map((o) => o.name)))
    .sort(byDate);
  const count = (s: DecisionStatus) => list.filter((d) => d.status === s).length;
  const next = list.find((d) => d.status !== 'done' && d.status !== 'decided' && d.decideBy);
  const toggle = (d: Decision) =>
    setOpen((o) => {
      const n = { ...o };
      if (n[d.id]) delete n[d.id];
      else n[d.id] = d;
      return n;
    });
  const edit = (id: string, patch: Partial<Decision>) => setOpen((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
  const save = async (id: string) => {
    const d = open[id];
    if (!d || !d.title.trim()) return;
    // V20-264: keep the task / rocket links Workflow saved while this was open.
    const cur = p.decisions.find((x) => x.id === id);
    await p.onSave({ ...d, title: d.title.trim(), taskId: cur?.taskId ?? d.taskId, launchId: cur?.launchId ?? d.launchId });
    setOpen((o) => {
      const n = { ...o };
      delete n[id];
      return n;
    });
  };
  const add = () => {
    if (!plan) return;
    const d = newDecision(pid, [...p.decisions, ...Object.values(open)].reduce((m, x) => Math.max(m, x.sort), 0) + 1, plan.id);
    setOpen((o) => ({ [d.id]: d, ...o }));
  };
  const fresh = Object.values(open).filter((d) => !p.decisions.some((x) => x.id === d.id) && !!plan && d.planId === plan.id);
  const rows = [...fresh, ...list];

  return (
    <section className={`panel panel-planner${p.full ? ' is-full' : ''}`} aria-labelledby="h-planner">
      <div className="panel-head">
        <div className="rockets-title pl-title">
          <h2 id="h-planner" className="panel-title">
            Project Planner
          </h2>
          {p.onToggle && (
            <button
              type="button"
              className={`rockets-toggle${p.full ? ' is-open' : ''}`}
              aria-label={p.full ? 'Back to the Project Planner card' : 'Open the full Project Planner'}
              title={p.full ? 'Back to the card' : 'Open full screen'}
              onClick={p.onToggle}
            >
              <Icon d={CHEV} />
            </button>
          )}
          {/* V20-253 (Dan, Nov 15): not a drop-down; ‹ › step through the plans, the name opens it to edit. */}
          <div className="picker-split pl-pill">
            <button type="button" className="picker-caret" aria-label="Previous plan" title="Previous plan" onClick={() => step(-1)} disabled={plans.length < 2}>
              <Icon d={LEFT} />
            </button>
            <button type="button" className="picker-main" title={plan ? 'Edit this plan' : 'Add a plan'} onClick={() => setSheet(plan ? { plan, isNew: false } : { plan: newPlan(null, 1), isNew: true })}>
              {plan?.name || 'Add a plan'}
            </button>
            <button type="button" className="picker-caret" aria-label="Next plan" title="Next plan" onClick={() => step(1)} disabled={plans.length < 2}>
              <Icon d={RIGHT} />
            </button>
          </div>
        </div>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn is-key" aria-label="Add a plan" title="Add a plan" onClick={() => setSheet({ plan: newPlan(plan?.projectId ?? null, plans.reduce((m, x) => Math.max(m, x.sort), 0) + 1), isNew: true })}>
            <Icon d={PLUS} />
          </button>
        </div>
      </div>

      <div className="pl-stats">
        <div className="budget-stat pl-stat is-on">
          <span className="budget-stat-label">Decisions</span>
          <span className="budget-stat-value">{list.length}</span>
        </div>
        {DECISION_STATUSES.map((s) => (
          <div key={s} className="budget-stat pl-stat">
            <span className="budget-stat-label">{s}</span>
            <span className="budget-stat-value">{count(s)}</span>
          </div>
        ))}
        <div className="budget-stat pl-stat">
          <span className="budget-stat-label">Next due</span>
          <span className="budget-stat-value">{next ? fmtDate(next.decideBy) : '—'}</span>
        </div>
      </div>

      <div className="pl-table" role="table" aria-label={`Decisions in ${plan?.name ?? 'this plan'}`}>
        <div className="pl-row pl-head" role="row">
          <span role="columnheader">Status</span>
          <span role="columnheader">Decision</span>
          <span role="columnheader">Description</span>
          <span role="columnheader">Cost</span>
          <span role="columnheader">By</span>
          <span role="columnheader" className="pl-acts pl-add">
            <button type="button" className="quick-btn task-quick is-key" aria-label="Add a decision" title="Add a decision" onClick={add} disabled={!plan}>
              <Icon d={PLUS} />
            </button>
          </span>
        </div>
        {!rows.length && <p className="field-hint pl-empty">{plan ? 'No decisions yet. The + above adds one.' : 'No plans yet. The teal + adds one.'}</p>}
        {rows.map((d, i) => {
          const o = open[d.id];
          const shown = o ?? d;
          return (
            <div key={d.id} className="pl-item">
              <div className={`pl-row${i % 2 ? ' is-alt' : ''}${o ? ' is-open' : ''}`} role="row">
                <span className="pl-chip" style={{ ['--chip' as string]: STATUS_COLOR[shown.status] }}>
                  {shown.status}
                </span>
                <button type="button" className="pl-name" onClick={() => toggle(d)}>
                  {shown.title || 'New decision'}
                </button>
                <span className="pl-desc">{shown.description}</span>
                <span className="pl-mono">{shown.cost}</span>
                <span className="pl-mono pl-due">{fmtDate(shown.decideBy)}</span>
                <span className="pl-acts">
                  <button
                    type="button"
                    className={`quick-btn task-quick${d.status === 'done' ? ' is-key' : ''}`}
                    aria-label={d.status === 'done' ? 'Mark not done' : 'Mark done'}
                    title={d.status === 'done' ? 'Mark not done' : 'Mark done'}
                    onClick={() => void p.onSave({ ...d, status: d.status === 'done' ? 'open' : 'done' })}
                    disabled={!p.decisions.some((x) => x.id === d.id)}
                  >
                    <Icon d={CHECK} />
                  </button>
                </span>
                <button type="button" className="rockets-toggle pl-open" aria-label={o ? 'Close' : 'Open'} title={o ? 'Close' : 'Open'} onClick={() => toggle(d)}>
                  <Icon d={o ? UP : CHEV} />
                </button>
              </div>
              {o && (
                <div className="pl-edit">
                  {/* V20-259 (Dan, Nov 15): buttons on top; Status · Decision · Description; options (name, link, cost);
                      Who decides + Decide by beside Notes. Workflow sends it to the calendar, Tasks or Rockets. */}
                  <div className="pl-edit-acts">
                    {p.decisions.some((x) => x.id === d.id) && (
                      <Workflow d={p.decisions.find((x) => x.id === d.id) ?? o} onCalendar={() => p.onToCalendar(o)} onTask={() => p.onToTask(o)} onRocket={() => p.onToRocket(o)} />
                    )}
                    {p.decisions.some((x) => x.id === d.id) && (
                      <button
                        type="button"
                        className={`icon-btn tool-btn tool-btn-danger${ask === d.id ? ' is-asking' : ''}`}
                        aria-label="Delete decision"
                        title="Delete"
                        onClick={() => {
                          if (ask !== d.id) return setAsk(d.id);
                          setAsk(null);
                          setOpen((x) => {
                            const n = { ...x };
                            delete n[d.id];
                            return n;
                          });
                          void p.onRemove(d.id);
                        }}
                      >
                        {ask === d.id ? <span className="ask-delete">Sure?</span> : <Icon d={TRASH} />}
                      </button>
                    )}
                    <button type="button" className="icon-btn tool-btn is-key" aria-label="Save decision" title="Save" disabled={!o.title.trim()} onClick={() => void save(d.id)}>
                      <Icon d={SAVE} />
                    </button>
                    {/* V20-261 (Dan, Nov 15): a way to bail: × closes it without saving. */}
                    <button type="button" className="icon-btn tool-btn" aria-label="Close without saving" title="Close without saving" onClick={() => toggle(d)}>
                      <Icon d={X} />
                    </button>
                  </div>
                  <div className="pl-grid3">
                    <label className="field">
                      <span>Status</span>
                      <select required value={o.status} onChange={(e) => edit(d.id, { status: e.target.value as DecisionStatus })}>
                        {DECISION_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Decision</span>
                      <input
                        required
                        value={o.title}
                        onChange={(e) => edit(d.id, { title: e.target.value })}
                        placeholder="What needs deciding"
                        autoFocus={!o.title}
                        enterKeyHint="next"
                        onKeyDown={(e) => {
                          // V20-254 (Dan, Nov 15): jotting it down. Enter saves; on a new one it opens the next new one.
                          if (e.key !== 'Enter' || !o.title.trim()) return;
                          e.preventDefault();
                          const isNew = !p.decisions.some((x) => x.id === d.id);
                          void save(d.id).then(() => isNew && add());
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <input value={o.description} onChange={(e) => edit(d.id, { description: e.target.value })} placeholder="One line" />
                    </label>
                  </div>
                  <div className="pl-opts">
                    {o.options.map((op, n) => (
                      <OptionRow
                        key={op.id}
                        n={n + 1}
                        op={op}
                        onChange={(v) => edit(d.id, { options: o.options.map((x) => (x.id === op.id ? v : x)) })}
                        onPick={() => edit(d.id, { options: o.options.map((x) => ({ ...x, picked: x.id === op.id ? !x.picked : false })) })}
                        onRemove={() => edit(d.id, { options: o.options.filter((x) => x.id !== op.id) })}
                      />
                    ))}
                    <AddOption onAdd={(op) => edit(d.id, { options: [...o.options, op] })} />
                  </div>
                  <div className="pl-bottom">
                    <div className="pl-bottom-left">
                      <label className="field">
                        <span>Who decides</span>
                        <input value={o.who} onChange={(e) => edit(d.id, { who: e.target.value })} placeholder="Dan" />
                      </label>
                      <label className="field">
                        <span>Decide by</span>
                        <input type="date" value={o.decideBy ?? ''} onChange={(e) => edit(d.id, { decideBy: e.target.value || null })} />
                      </label>
                    </div>
                    <label className="field">
                      <span>Notes</span>
                      <textarea rows={4} value={o.notes} onChange={(e) => edit(d.id, { notes: e.target.value })} placeholder="Why, what it's waiting on" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Sheet open={!!sheet} title={sheet?.isNew ? 'Add plan' : 'Edit plan'} onClose={() => setSheet(null)} wide>
        {sheet && (
          <PlanForm
            key={sheet.plan.id}
            plan={sheet.plan}
            projects={p.projects}
            existing={p.decisions.filter((d) => d.planId === sheet.plan.id).sort(byDate)}
            onSave={async (pl, titles) => {
              await p.onSavePlan(pl);
              const base = p.decisions.reduce((m, x) => Math.max(m, x.sort), 0) + 1;
              const kids = titles.map((t, i) => ({ ...newDecision(pl.projectId, base + i, pl.id), title: t }));
              // A plan moved to another project takes its decisions with it.
              const moved = p.decisions.filter((d) => d.planId === pl.id && d.projectId !== pl.projectId).map((d) => ({ ...d, projectId: pl.projectId }));
              if (kids.length || moved.length) await p.onSaveMany([...moved, ...kids]);
              setPlanId(pl.id);
              setSheet(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

/** V20-253: Add plan, built from Add task: Project | Plan, Description, Decisions (like steps), dates, Notes. */
function PlanForm({ plan, projects, existing, onSave }: { plan: Plan; projects: Project[]; existing: Decision[]; onSave: (p: Plan, titles: string[]) => Promise<void> }) {
  const [d, setD] = useState(plan);
  const [lines, setLines] = useState<string[]>(existing.length ? [] : ['']);
  const formId = useId();
  const tree = projectTree(pickable(projects, plan.projectId));
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setD((x) => ({ ...x, [k]: v }));
  const ok = !!d.name.trim() && !!d.projectId;
  return (
    <form
      id={formId}
      className="task-form task-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        await onSave({ ...d, name: d.name.trim(), description: d.description.trim(), notes: d.notes.trim() }, lines.map((x) => x.trim()).filter(Boolean));
      }}
    >
      <FormActions formId={formId} saveDisabled={!ok} />
      <div className="time-grid">
        <label className="field">
          <span>Project</span>
          <select required value={d.projectId ?? ''} onChange={(e) => set('projectId', e.target.value || null)}>
            <option value="" disabled>
              Pick a project
            </option>
            {tree.map(({ area, children }) => (
              <optgroup key={area.id} label={area.name}>
                <option value={area.id}>{projectPick(projects, area)}</option>
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {projectPick(projects, c)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Plan</span>
          <input required value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="BETA – WEEK 1" autoFocus />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <input value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="What this plan is for" />
      </label>
      <div className="field steps-field">
        <span>Decisions</span>
        {existing.length > 0 && (
          <ul className="steps-list">
            {existing.map((x) => (
              <li key={x.id} className={x.status === 'done' ? 'is-done' : ''}>
                ↳ {x.title}
              </li>
            ))}
          </ul>
        )}
        {lines.map((text, i) => (
          <div key={i} className="step-input">
            <span aria-hidden="true">↳</span>
            <input
              aria-label={`Decision ${existing.length + i + 1}`}
              value={text}
              autoFocus={i > 0 && i === lines.length - 1}
              onChange={(e) => setLines((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setLines((l) => [...l, '']);
                }
              }}
              placeholder="What needs deciding"
            />
          </div>
        ))}
        <button type="button" className="link-btn link-btn-inline step-more" onClick={() => setLines((l) => [...l, ''])}>
          + Add a decision
        </button>
      </div>
      <div className="time-grid">
        <label className="field">
          <span>Start</span>
          <input type="date" value={d.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
        </label>
        <label className="field">
          <span>Decide by</span>
          <input type="date" min={d.startDate ?? undefined} value={d.decideBy ?? ''} onChange={(e) => set('decideBy', e.target.value || null)} />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything to remember" />
      </label>
    </form>
  );
}

/** V20-260 (Dan, Nov 15): an option is three fields in the form style: Option · Link · Cost, then ✓ pick and ×. */
function OptionRow({ n, op, onChange, onPick, onRemove }: { n: number; op: DecisionOption; onChange: (o: DecisionOption) => void; onPick: () => void; onRemove: () => void }) {
  const url = op.link?.trim() ? (/^https?:\/\//i.test(op.link) ? op.link : `https://${op.link}`) : '';
  return (
    <div className={`pl-opt3${op.picked ? ' is-picked' : ''}`}>
      <label className="field">
        <span>Option {n}</span>
        <input value={op.name} onChange={(e) => onChange({ ...op, name: e.target.value })} />
      </label>
      <label className="field pl-opt-link">
        <span>
          Link
          {url && (
            <a href={url} target="_blank" rel="noreferrer" title="Open link">
              {' '}↗
            </a>
          )}
        </span>
        <input value={op.link ?? ''} onChange={(e) => onChange({ ...op, link: e.target.value })} placeholder="https://…" />
      </label>
      <label className="field">
        <span>Cost</span>
        <input value={op.cost} onChange={(e) => onChange({ ...op, cost: e.target.value })} placeholder="$0" />
      </label>
      <button type="button" className={`quick-btn task-quick${op.picked ? ' is-key' : ''}`} aria-label={op.picked ? 'Picked (tap to unpick)' : 'Pick this option'} title={op.picked ? 'Picked' : 'Pick'} onClick={onPick}>
        <Icon d={CHECK} />
      </button>
      <button type="button" className="quick-btn task-quick" aria-label="Remove option" title="Remove" onClick={onRemove}>
        <Icon d={X} />
      </button>
    </div>
  );
}

const FLOW = 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9';
/** V20-259: Add to workflow: the decision goes to the calendar, Tasks or Rockets. */
function Workflow({ d, onCalendar, onTask, onRocket }: { d: Decision; onCalendar: () => void; onTask: () => void; onRocket: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div
      className="row-menu pl-flow"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button type="button" className="icon-btn tool-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Add to workflow" title="Add to workflow" onClick={() => setOpen((x) => !x)}>
        <Icon d={FLOW} />
      </button>
      {open && (
        <div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={run(onCalendar)}>
            Add to calendar
          </button>
          <button type="button" role="menuitem" onClick={run(onTask)}>
            {d.taskId ? 'Open its task' : 'Make it a task'}
          </button>
          <button type="button" role="menuitem" onClick={run(onRocket)}>
            {d.launchId ? 'Open its rocket' : 'Push rocket'}
          </button>
        </div>
      )}
    </div>
  );
}

function AddOption({ onAdd }: { onAdd: (o: DecisionOption) => void }) {
  const [o, setO] = useState({ name: '', link: '', cost: '' });
  const go = () => {
    if (!o.name.trim()) return;
    onAdd({ id: crypto.randomUUID(), name: o.name.trim(), note: '', cost: o.cost.trim(), link: o.link.trim(), picked: false });
    setO({ name: '', link: '', cost: '' });
  };
  const enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go();
    }
  };
  return (
    <div className="pl-opt3 pl-addopt3">
      <label className="field">
        <span>Add an option</span>
        <input value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} onKeyDown={enter} placeholder="Porkbun, Namecheap…" />
      </label>
      <label className="field">
        <span>Link</span>
        <input value={o.link} onChange={(e) => setO({ ...o, link: e.target.value })} onKeyDown={enter} placeholder="https://…" />
      </label>
      <label className="field">
        <span>Cost</span>
        <input value={o.cost} onChange={(e) => setO({ ...o, cost: e.target.value })} onKeyDown={enter} placeholder="$0" />
      </label>
      <button type="button" className="quick-btn task-quick" aria-label="Add option" title="Add option" onClick={go}>
        <Icon d={PLUS} />
      </button>
      <span />
    </div>
  );
}
