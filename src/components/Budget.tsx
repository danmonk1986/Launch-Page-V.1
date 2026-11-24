import { useHeaderSearch } from '../lib/headerSearch';
import { useBooks } from '../lib/beta';
import { blankBudgetCsv, download as downloadFile } from '../lib/budget';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { Icon, TaskSheet, ViewToggle } from './Tasks';
import { useOpensUp } from './Rockets';
import { thisMonth } from './Expenses';
import { originalLabel, rateToCad, toCad } from '../lib/currency';
import { BudgetMonth } from './BudgetMonth';
import { auditBudget, type AuditChange, type AuditKind } from '../lib/budgetAudit';
import { LineCard, type LinePicks } from './LineCard';
import { lineDateKey, type Expense } from '../lib/expenses';
import { fromLine, planLinks, taskFor, type LinkPlan } from '../lib/links';
import { newTask, taskName, type Task } from '../lib/tasks';
import { describeRepeat, readRepeat } from '../lib/repeat';
import type { Project } from '../lib/projects';
import {
  BUDGET_CATEGORIES,
  BUDGET_SECTIONS,
  GROUP_BY,
  groupKey,
  newBudgetLine,
  linesFromFile,
  money,
  monthlyByCategory,
  sumLines,
  type BudgetGroupBy,
  type BudgetLine,
  type BudgetSection
} from '../lib/budget';

const PLUS = 'M12 5v14M5 12h14';
// One square button cycles the totals: layers (section), a list (payment category), a folder (project), four boxes (budget group).
const GROUP_ICON: Record<BudgetGroupBy, string> = {
  section: 'M12 3 2 8l10 5 10-5zM2 12l10 5 10-5M2 16l10 5 10-5',
  pmtCategory: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  project: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  category: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
};
// Oct 28: the same Sync icon as the calendar.
const SYNC = 'M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4h-4M5.5 21v-4h4';
// V20-501: the Budget audit (a ticked box).
const AUDIT = 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11';
const AUDIT_LABEL: Record<AuditKind, string> = { add: 'Add to the Budget', price: 'New price', rhythm: 'Now monthly' };
const AUDIT_SKIP = 'launchpage.budgetAuditSkip.v1';
const auditDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

type Props = {
  lines: BudgetLine[];
  projects: Project[];
  onSave: (l: BudgetLine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReplace: (lines: BudgetLine[]) => Promise<void>;
  onClose: () => void;
  /** V20-269: a line picked on the Budget card opens straight into Edit line; closing it goes back to the card. */
  openId?: string | null;
  onOpened?: () => void;
  /** ⋯ on a line (Oct 20): the same as a task's, with Add a task in place of Add a step. */
  onToCalendar: (l: BudgetLine, projectId: string | null) => void;
  onToLaunch: (l: BudgetLine) => void;
  /** The linked task's form opens here; saving goes through the usual task save. */
  onSaveTask: (t: Task) => Promise<void>;
  onSaveTasks: (t: Task[]) => Promise<void>;
  /** ⋯ on a linked line: go to its task on the Tasks page. */
  onGoToTask: (id: string) => void;
  /** Expenses (LP-030): what was actually paid. */
  expenses: Expense[];
  /** Link and dedupe (LP-030 step 3). */
  tasks: Task[];
  onApplyLinks: (plan: LinkPlan) => Promise<void>;
  /** V20-501 (Books): the Budget audit's changes, saved together. */
  onSaveMany?: (lines: BudgetLine[]) => Promise<void>;
};

type BudgetView = 'master' | 'month';

/** The ⋯ menu on a budget line. */
function LineMenu({ l, hasTask, onEdit, onCalendar, onLaunch, onTask, onRecalc, onRemove }: { l: BudgetLine; hasTask: boolean; onEdit: () => void; onCalendar: () => void; onLaunch: () => void; onTask: () => void; onRecalc: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const up = useOpensUp(wrap, open);
  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div
      ref={wrap}
      className="row-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button type="button" className="quick-btn quick-skip task-quick" aria-haspopup="menu" aria-expanded={open} aria-label={`More for ${l.description}`} title="More" onClick={() => setOpen((o) => !o)}>
        <Icon d="M5 12h.01M12 12h.01M19 12h.01" size={18} />
      </button>
      {open && (
        <div className={`row-menu-list${up ? ' is-up' : ''}`} role="menu">
          <button type="button" role="menuitem" onClick={run(onEdit)}>
            Edit
          </button>
          <button type="button" role="menuitem" onClick={run(onCalendar)}>
            Add to calendar
          </button>
          <button type="button" role="menuitem" onClick={run(onLaunch)}>
            Create launch
          </button>
          <button type="button" role="menuitem" onClick={run(onTask)}>
            {hasTask ? 'Go to its task' : 'Add a task'}
          </button>
          {originalLabel(l) && (
            <button type="button" role="menuitem" title={`${originalLabel(l)} at today's rate`} onClick={run(onRecalc)}>
              Recalc to today's rate
            </button>
          )}
          <button type="button" role="menuitem" className="menu-danger" onClick={run(onRemove)}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/^stardvst\s+/, '').replace(/[^a-z0-9]/g, '');

function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Budget V.1: the Launch Sheet's BUDGET tab, laid out like the task list. */
export function BudgetPage(p: Props) {
  const books = useBooks();
  // The box clicked: shows only its lines. null = everything.
  const [pick, setPick] = useState<string | null>(null);
  // V20-245: the header search drives this page.
  const { q } = useHeaderSearch();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  // V20-269: opened from a Budget card row: Edit line opens at once, and closing it returns to the card.
  const fromCard = useRef(false);
  useEffect(() => {
    if (!p.openId) return;
    // V20-422 (Dan, Nov 20): the Budget card's + opens Add line here, and closing it returns to the card.
    if (p.openId === 'new') {
      p.onOpened?.();
      fromCard.current = true;
      setAdding(true);
      return;
    }
    const l = p.lines.find((x) => x.id === p.openId);
    p.onOpened?.();
    if (!l) return;
    fromCard.current = true;
    setEditing(l);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.openId]);
  const closeEdit = () => {
    setEditing(null);
    setAdding(false);
    if (fromCard.current) {
      fromCard.current = false;
      p.onClose();
    }
  };
  const [incoming, setIncoming] = useState<{ name: string; lines: BudgetLine[] } | null>(null);
  const [importError, setImportError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  // V20-189 / V20-198: Budget's import lives in Settings › Data Management; it reaches here by event.
  useEffect(() => {
    const imp = () => file.current?.click();
    window.addEventListener('budget:import', imp);
    return () => window.removeEventListener('budget:import', imp);
  }, []);
  const [linkPlan, setLinkPlan] = useState<LinkPlan | null>(null);
  const [linking, setLinking] = useState(false);
  const [adding, setAdding] = useState(false);
  // The linked task whose form is open, and whether it was just made.
  // One Add a task at a time (a double tap made two tasks).
  const busy = useRef(false);
  const [taskOpen, setTaskOpen] = useState<{ task: Task; fresh: boolean } | null>(null);
  // Budget | Expenses (LP-030), remembered on this device.
  const [view, setViewState] = useState<BudgetView>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.view');
      return v === 'month' ? v : 'master';
    } catch {
      return 'master';
    }
  });
  // One month for Month and Expenses, so switching keeps your place.
  const [month, setMonth] = useState(thisMonth);
  const setView = (v: BudgetView) => {
    setViewState(v);
    try {
      localStorage.setItem('launchpage.budget.view', v);
    } catch {
      /* ignore */
    }
  };

  const bySection = useMemo(() => {
    const g = {} as Record<BudgetSection, BudgetLine[]>;
    for (const s of BUDGET_SECTIONS) g[s.id] = p.lines.filter((l) => l.section === s.id).sort((a, b) => lineDateKey(a) - lineDateKey(b) || a.description.localeCompare(b.description, undefined, { sensitivity: 'base' }));
    return g;
  }, [p.lines]);
  const [groupBy, setGroupByState] = useState<BudgetGroupBy>(() => {
    try {
      const v = localStorage.getItem('launchpage.budget.groupBy');
      // V20-486 (Dan, Nov 23): Books opens on divisions, so a business of one filters business vs personal in a tap.
      return GROUP_BY.some((g) => g.id === v) ? (v as BudgetGroupBy) : books ? 'project' : 'section';
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
  /** ⋯ → Add a task: a linked task from the line, then its form. A linked line goes to its task. */
  async function openTaskFor(l: BudgetLine) {
    if (busy.current) return;
    const have = taskFor(l, p.tasks);
    if (have?.budgetLineId === l.id) return p.onGoToTask(have.id);
    busy.current = true;
    if (have) {
      // A task with the same name already exists: link that one rather than adding a second.
      const t = fromLine(have, l);
      await p.onSaveTask(t);
      busy.current = false;
      return setTaskOpen({ task: t, fresh: false });
    }
    const base = newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), projectFor(l.project)?.id ?? null);
    const t = fromLine({ ...base, status: 'PENDING', notes: l.notes }, l);
    await p.onSaveTask(t);
    busy.current = false;
    setTaskOpen({ task: t, fresh: true });
  }
  /**
   * Oct 28 · line card save: the line, then its task. Every line has a linked task unless it's
   * withheld (an existing task with the same name gets linked, not doubled); withholding a line
   * that had one sends that task to Recently deleted.
   */
  async function saveLine(l: BudgetLine, withhold: boolean) {
    if (busy.current) return;
    busy.current = true;
    try {
      await p.onSave(l);
      const linked = p.tasks.find((t) => t.budgetLineId === l.id && !t.deletedAt);
      if (withhold && linked) await p.onSaveTask({ ...linked, budgetLineId: null, deletedAt: new Date().toISOString() });
      if (!withhold && !linked) {
        const same = taskFor(l, p.tasks);
        const base = same ?? { ...newTask(p.tasks.reduce((m, t) => Math.max(m, t.sort + 1), 0), projectFor(l.project)?.id ?? null), status: 'PENDING', notes: l.notes };
        await p.onSaveTask({ ...fromLine(base, l), projectId: base.projectId ?? projectFor(l.project)?.id ?? null });
      }
    } finally {
      busy.current = false;
    }
  }

  /** ⋯ Recalc: a line priced in another currency gets today's CAD amount. */
  const [recalcNote, setRecalcNote] = useState('');
  // V20-501 → V20-505 (Dan, Nov 24, Books): the Budget audit, worked out live; the header button shows its count and
  // opens it as a card above the lines (the same as Expenses' audit). Tick = apply the change; bin = ignore it (that
  // suggestion at that price isn't asked again, remembered on this device).
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditSkip, setAuditSkip] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(AUDIT_SKIP) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const skipKey = (c: AuditChange) => `${c.key}|${c.after.amount ?? ''}|${c.after.repeat ?? ''}`;
  const audit = useMemo(
    () => (books && p.onSaveMany ? auditBudget(p.lines, p.expenses, new Date().toLocaleDateString('en-CA')).filter((c) => !auditSkip.includes(skipKey(c))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [books, p.lines, p.expenses, auditSkip]
  );
  const applyAudit = async (list: AuditChange[]) => {
    if (!list.length || !p.onSaveMany) return;
    setAuditing(true);
    await p.onSaveMany(list.map((c) => c.after));
    setAuditing(false);
    setRecalcNote(`Budget audit: ${list.length} change${list.length === 1 ? '' : 's'} applied.`);
  };
  const skipAudit = (c: AuditChange) => {
    const next = [...auditSkip, skipKey(c)];
    setAuditSkip(next);
    try {
      localStorage.setItem(AUDIT_SKIP, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  // Clicking an item: the Master list, everything showing, scrolled to its line and lit up.
  const [spot, setSpot] = useState<{ id: string; n: number } | null>(null);
  const showLine = (id: string) => {
    setView('master');
    setPick(null);
    setClosed({});
    setSpot((x) => ({ id, n: (x?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!spot) return;
    const t = window.setTimeout(() => document.getElementById(`bud-${spot.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => window.clearTimeout(t);
  }, [spot]);
  async function recalc(l: BudgetLine) {
    if (l.foreign == null || !l.currency) return;
    setRecalcNote(`Getting today's ${l.currency} rate…`);
    try {
      const rate = await rateToCad(l.currency);
      const amount = toCad(l.foreign, rate);
      await p.onSave({ ...l, amount });
      // Oct 30: say the rate, and say plainly when nothing moved (rates change once a business day).
      const at = `1 ${l.currency} = ${rate.toFixed(4)} CAD today`;
      setRecalcNote(
        l.amount !== null && Math.abs(l.amount - amount) < 0.005
          ? `${l.description}: no change, still ${money(amount)} (${at}). Rates update once a business day.`
          : `${l.description}: ${l.foreign} ${l.currency} is now ${money(amount)}${l.amount !== null ? ` (was ${money(l.amount)})` : ''} · ${at}.`
      );
    } catch (e) {
      setRecalcNote(e instanceof Error ? e.message : 'No rate right now.');
    }
    window.setTimeout(() => setRecalcNote(''), 6000);
  }
  /** A line's ⋯ menu (Master and Month). */
  const lineMenu = (l: BudgetLine) => (
    <LineMenu
      l={l}
      onEdit={() => setEditing(l)}
      onCalendar={() => p.onToCalendar(l, projectFor(l.project)?.id ?? null)}
      onLaunch={() => p.onToLaunch(l)}
      hasTask={linkedIds.has(l.id)}
      onTask={() => void openTaskFor(l)}
      onRecalc={() => void recalc(l)}
      onRemove={() => void p.onDelete(l.id)}
    />
  );
  /** Oct 26: an item's name goes to its task (edit is in ⋯); with no task it's plain text. */
  const itemName = (l: BudgetLine) => {
    const t = p.tasks.find((x) => x.budgetLineId === l.id && !x.deletedAt);
    return t ? (
      <button type="button" className="task-name" title="Go to its task" onClick={() => p.onGoToTask(t.id)}>
        {l.description}
      </button>
    ) : (
      <span className="item-name">{l.description}</span>
    );
  };
  const linkedIds = new Set(p.tasks.filter((t) => t.budgetLineId && !t.deletedAt).map((t) => t.budgetLineId!));
  const picks = (f: (l: BudgetLine) => string) => [...new Set(p.lines.map(f).map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const linePicks: LinePicks = useMemo(() => {
    const links = new Map<string, string>();
    for (const x of [...p.tasks.filter((t) => !t.deletedAt), ...p.lines]) if ((x.linkLabel ?? '').trim() && (x.link ?? '').trim()) links.set(x.linkLabel!.trim(), x.link!.trim());
    return {
      projects: [...new Set([...picks((l) => l.project), ...p.projects.map((x) => x.name.replace(/^STARDVST\s+/i, ''))])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      methods: picks((l) => l.method),
      pmtCategories: picks((l) => l.pmtCategory),
      links: [...links].map(([label, link]) => ({ label, link })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tasks, p.lines, p.projects]);

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

  // Search (Oct 22): a line matches on any of its words or its amount.
  const needle = q.trim().toLowerCase();
  const found = (l: BudgetLine) =>
    !needle || [l.description, l.project, l.method, l.type, l.category, l.pmtCategory, l.notes, l.amount === null ? '' : String(l.amount)].some((v) => v.toLowerCase().includes(needle));
  const shows = (l: BudgetLine) => (pick === null || groupKey(l, groupBy) === pick) && found(l);
  const sections = BUDGET_SECTIONS.map((s) => s.id).filter((id) => (pick === null && !needle) || bySection[id].some(shows));
  const boxLabel = (c: string) => {
    if (groupBy !== 'section') return c;
    const t = BUDGET_SECTIONS.find((x) => x.id === c)?.title ?? c;
    return c === 'annual' ? `${t} ÷ 12` : c === 'planned' ? `${t} · not in monthly` : t;
  };
  const boxValue = (c: string) => (groupBy === 'section' && c === 'planned' ? sumLines(bySection.planned) : perCat[c] ?? 0);

  return (
    <section className="panel panel-tasks-page panel-budget" aria-labelledby="h-budget">
      <div className="panel-head">
        {/* V20-250 (Dan, Nov 15): like Tasks, the ^ beside BUDGET goes back to the Launch Page card (the × is gone). */}
        <div className="rockets-title">
          <h2 id="h-budget" className="panel-title">
            Budget
          </h2>
          <button type="button" className="rockets-toggle is-open" aria-label="Back to the Budget card" title="Back to the Budget card" onClick={p.onClose}>
            <Icon d="M6 9l6 6 6-6" />
          </button>
        </div>
        <ViewToggle month={view === 'month'} listName="Master" onToggle={() => setView(view === 'month' ? 'master' : 'month')} nav={{ month, onMonth: setMonth }} />
        <div className="panel-actions">
          {view === 'master' && (
          <>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Sync with Tasks"
            title="Sync with Tasks: link budget lines to their tasks, clear duplicate tasks, add tasks for bills"
            disabled={!p.lines.length}
            onClick={() => setLinkPlan(planLinks(p.lines, p.tasks, { now: new Date().toISOString(), projectFor: (n) => projectFor(n)?.id ?? null }))}
          >
            <Icon d={SYNC} />
          </button>
          </>
          )}
          {/* V20-501b / V20-505: the audit in both views; its count on the button. */}
          {books && p.onSaveMany && (
            <button type="button" className={`icon-btn tool-btn audit-btn${auditOpen ? ' is-on' : ''}`} aria-label={`Budget audit${audit.length ? `: ${audit.length} to check` : ''}`} aria-pressed={auditOpen} title="Budget audit: new prices, new fixed bills and bills gone monthly, from your Expenses" onClick={() => setAuditOpen((o) => !o)}>
              <Icon d={AUDIT} />
              {audit.length > 0 && <span className="audit-count">{audit.length}</span>}
            </button>
          )}
          {/* V20-203 (Dan, Nov 14): search on one side, + on the other (then ×). */}
          {(
            <button type="button" className="icon-btn tool-btn" aria-label="Add line" title="Add a budget line (it goes to Tasks too, unless withheld)" onClick={() => setAdding(true)}>
            <Icon d={PLUS} />
          </button>
          )}
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

      {recalcNote && (
        <p className="field-hint recalc-note" role="status">
          {recalcNote}
        </p>
      )}
      {auditOpen && (
        <div className="statement-check budget-audit-card">
          <div className="statement-check-head">
            <h3 className="card-h">{audit.length ? `Audit · ${audit.length} to check` : 'Audit · all clear'}</h3>
            <button type="button" className="btn btn-quiet" onClick={() => setAuditOpen(false)}>
              Hide
            </button>
            {audit.length > 0 && (
              <button type="button" className="btn" disabled={auditing} onClick={() => void applyAudit(audit)}>
                {auditing ? 'Fixing…' : `Fix all ${audit.length}`}
              </button>
            )}
          </div>
          <p className="field-hint">
            {audit.length
              ? "From your Expenses, last month and this month up to today. Click one to see its line below. The tick applies the change; the bin ignores it (it won't be suggested again at that price)."
              : 'Your Budget matches your Expenses: no new prices, no fixed bills missing, nothing gone monthly.'}
          </p>
          {audit.length > 0 && (
            <div className="statement-check-list">
              {audit.map((c) => {
                const latest = c.charges[0];
                return (
                  <div key={c.key} className="statement-check-row">
                    <span className="col-date">{latest ? auditDate(latest.date) : ''}</span>
                    <span className="bank-mono">{c.after.method || '—'}</span>
                    {c.before ? (
                      <button type="button" className="link-btn pl-desc statement-check-go" title="Show its line below" onClick={() => showLine(c.before!.id)}>
                        {c.after.description}
                      </button>
                    ) : (
                      <span className="pl-desc" title={c.why}>
                        {c.after.description}
                      </span>
                    )}
                    <span className="pl-mono">
                      {c.before && c.kind !== 'add' && <s className="audit-was">{c.before.amount === null ? '—' : money(c.before.amount)}</s>} {money(c.after.amount ?? 0)}
                    </span>
                    <span className="statement-check-why" title={c.why}>
                      {AUDIT_LABEL[c.kind]}
                    </span>
                    <span className="bc-lost-acts statement-check-acts">
                      <button type="button" className="quick-btn statement-bin" disabled={auditing} onClick={() => skipAudit(c)} aria-label={`Ignore: ${c.after.description}`} title="Ignore it: don't suggest this again">
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                      <button type="button" className="quick-btn quick-done" disabled={auditing} onClick={() => void applyAudit([c])} aria-label={`Apply: ${c.after.description}`} title={`Apply: ${c.why}`}>
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {view === 'month' && <BudgetMonth month={month} onMonth={setMonth} lines={p.lines} expenses={p.expenses} linkedIds={linkedIds} search={q} name={itemName} menu={lineMenu} />}

      {view === 'master' && p.lines.length > 0 && (
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

      {view !== 'master' ? null : p.lines.length === 0 ? (
        books ? (
          // V20-456 (Dan, Nov 22): Books track only: the empty Budget hands out a blank sheet to fill in and bring back.
          <div className="budget-empty">
            <p className="panel-empty">
              No budget yet. Download the blank budget sheet and open it in Excel or Google Sheets. Add one line per bill or cost (its section, date, what it is, how you pay, amount), or paste in values from a sheet you already keep, or from a Launch Sheet's BUDGET tab: the columns match. Save it as <strong>.csv</strong>, then import it here.
            </p>
            <div className="budget-empty-acts">
              <button type="button" className="btn btn-quiet" onClick={() => downloadFile('BOOKS-BUDGET-blank.csv', blankBudgetCsv(), 'text/csv')}>
                Download the blank sheet
              </button>
              <button type="button" className="btn" onClick={() => file.current?.click()}>
                Import your sheet
              </button>
            </div>
          </div>
        ) : (
        <div className="budget-empty">
          <p className="panel-empty">
            No budget yet. In the Launch Sheet, open the <strong>BUDGET</strong> tab, then <strong>File → Download → Comma-separated values (.csv)</strong>, and import it from ⚙ › Data Management › Import budget.
          </p>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Import the BUDGET tab
          </button>
        </div>
        )
      ) : (
        <div className="task-scroll">
          <table className="task-table budget-table budget-lines">
            <thead>
              <tr>
                <th className="col-project">Project</th>
                <th className="col-date">Date</th>
                <th className="col-task">Line item</th>
                <th className="col-center">Method</th>
                <th className="col-center">Type</th>
                <th className="col-center">Group</th>
                <th>Category</th>
                <th className="col-amount">Amount</th>
                <th className="col-notes">Notes</th>
                <th className="col-actions" aria-label="More" />
              </tr>
            </thead>
            {sections.map((id) => {
              const s = BUDGET_SECTIONS.find((x) => x.id === id)!;
              const rows = bySection[id].filter(shows);
              const shut = !needle && !(groupBy === 'section' && pick) && closed[id];
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
                    <th />
                  </tr>
                  {!shut && rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="task-empty">
                        Nothing here.
                      </td>
                    </tr>
                  )}
                  {!shut &&
                    rows.map((l, i) => (
                      <tr key={l.id} id={`bud-${l.id}`} className={`task-row${i % 2 ? ' is-alt' : ''}${spot?.id === l.id ? ' is-spot' : ''}`}>
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
                        <td className="col-date" title={l.repeat ? `Repeats: ${describeRepeat(readRepeat(l.repeat))}` : undefined}>
                          {l.repeat ? describeRepeat(readRepeat(l.repeat)) : shortDate(l.date)}
                        </td>
                        <td className="col-task">
                          {itemName(l)}
                        </td>
                        <td className="col-center">{l.method}</td>
                        <td className="col-center">{l.type && <span className={`status${l.type === 'FIXED' ? ' status-three' : ''}`}>{l.type}</span>}</td>
                        <td className="col-center">{l.category}</td>
                        <td>{l.pmtCategory}</td>
                        <td className="col-amount">
                          {l.amount === null ? '' : money(l.amount)}
                          {originalLabel(l) && <span className="money-orig">{originalLabel(l)}</span>}
                        </td>
                        <td className="col-notes" title={l.notes}>
                          {l.notes}
                        </td>
                        <td className="col-actions">
                          <div className="timed-quick">
                            {lineMenu(l)}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <Sheet open={!!editing || adding} title={adding ? 'Add line' : 'Edit line'} onClose={closeEdit} wide>
        {(adding || editing) && (() => {
          const line = adding ? newBudgetLine('planned', p.lines.reduce((m, l) => Math.max(m, l.sort + 1), 0)) : editing!;
          const hasTask = p.tasks.some((t) => t.budgetLineId === line.id && !t.deletedAt);
          return (
            <LineCard
              key={adding ? 'new' : line.id}
              line={adding ? { ...line, type: '' } : line}
              isNew={adding}
              hasTask={hasTask}
              picks={linePicks}
              onSave={async (l, withhold) => {
                await saveLine(l, withhold);
                closeEdit();
              }}
              onDelete={
                adding
                  ? undefined
                  : async () => {
                      await p.onDelete(line.id);
                      closeEdit();
                    }
              }
            />
          );
        })()}
      </Sheet>

      <TaskSheet
        task={taskOpen?.task ?? null}
        title={taskOpen?.fresh ? 'Task details (linked to the budget)' : 'Linked task'}
        tasks={p.tasks}
        projects={p.projects}
        onSave={p.onSaveTask}
        onSaveMany={p.onSaveTasks}
        onClose={() => setTaskOpen(null)}
      />

      <Sheet open={!!linkPlan} title="Sync with Tasks" onClose={() => setLinkPlan(null)} wide>
        {linkPlan && (
          <div className="reminder link-plan">
            {linkPlan.remove.length + linkPlan.linked.length + linkPlan.created.length === 0 ? (
              <p className="panel-empty">Everything is already linked, with no duplicate tasks.</p>
            ) : (
              <p className="panel-empty">
                <strong>{linkPlan.linked.length}</strong> tasks linked to their budget line (the budget line's name, repeat and amount win) ·{' '}
                <strong>{linkPlan.created.length}</strong> new tasks for bills with none · <strong>{linkPlan.remove.length}</strong> duplicate tasks to Recently deleted
                (restore from ⋯ for 30 days). Variable lines stay budget-only.
              </p>
            )}
            {linkPlan.linked.length > 0 && (
              <details open>
                <summary>Linked ({linkPlan.linked.length})</summary>
                <ul>
                  {linkPlan.linked.map(({ task, line }) => (
                    <li key={task.id}>
                      <strong>{line.description}</strong> ← {taskName(p.tasks.find((t) => t.id === task.id) ?? task)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.created.length > 0 && (
              <details>
                <summary>New tasks ({linkPlan.created.length})</summary>
                <ul>
                  {linkPlan.created.map(({ task, line }) => (
                    <li key={task.id}>
                      {line.description} <span className="link-plan-dim">· {line.repeat ? describeRepeat(readRepeat(line.repeat)) : shortDate(line.date) || 'no date'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.remove.length > 0 && (
              <details>
                <summary>Duplicates removed ({linkPlan.remove.length})</summary>
                <ul>
                  {linkPlan.remove.map((t) => (
                    <li key={t.id}>
                      {t.task} {t.description && <span className="link-plan-dim">· {t.description}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {linkPlan.gaps.length > 0 && (
              <details>
                <summary>Still missing ({linkPlan.gaps.length})</summary>
                <ul>
                  {linkPlan.gaps.map(({ line, missing }) => (
                    <li key={line.id}>
                      {line.description} <span className="link-plan-dim">· {missing.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="reminder-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setLinkPlan(null)}>
                Cancel
              </button>
              {linkPlan.remove.length + linkPlan.linked.length + linkPlan.created.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  disabled={linking}
                  onClick={async () => {
                    setLinking(true);
                    await p.onApplyLinks(linkPlan);
                    setLinking(false);
                    setLinkPlan(null);
                  }}
                >
                  {linking ? 'Linking…' : 'Link and clean up'}
                </button>
              )}
            </div>
          </div>
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
                  {/* V20-010: say what Replace does to linked tasks before it happens. */}
                  {p.lines.length > 0 && linkedIds.size > 0 && ` Replace removes your current lines; ${linkedIds.size === 1 ? 'the 1 linked task stays' : `their ${linkedIds.size} linked tasks stay`} in Tasks, unlinked.`}
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

