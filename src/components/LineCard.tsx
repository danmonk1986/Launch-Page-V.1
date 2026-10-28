import { useId, useState } from 'react';
import { FormActions } from './Sheet';
import { MoneyField, settleMoney } from './MoneyField';
import { TitleCombo } from './Launchers';
import { RepeatPicker } from './RepeatPicker';
import { BUDGET_CATEGORIES, PMT_TYPES, type BudgetLine, type BudgetSection } from '../lib/budget';
import { readRepeat, writeRepeat, type Repeat } from '../lib/repeat';

const az = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** Which group a line sits in, from its Pmt type and Repeat: variable, monthly fixed, annual, or a one-off (planned). */
export function sectionOfLine(type: string, r: Repeat): BudgetSection {
  if (type.trim().toUpperCase() === 'VARIABLE') return 'variable';
  if (r.kind === 'annual' || r.kind === 'quarterly') return 'annual';
  if (r.kind === 'none') return 'planned';
  return 'fixed';
}

export type LinePicks = { projects: string[]; methods: string[]; pmtCategories: string[]; links: { label: string; link: string }[] };

/**
 * The Add / Edit line card (Oct 28 wireframe), the same shape as the task card:
 * Project | Expense, Line item, Pmt method | Pmt type, Budget group | Payment category, Date | Repeat,
 * Info link | Link name, Notes + Withhold from Task List. Every line gets a linked task unless withheld
 * (variable lines start withheld: an allotment, nothing to tick off).
 */
export function LineCard(p: {
  line: BudgetLine;
  isNew: boolean;
  /** Has a linked task now (edit). */
  hasTask: boolean;
  picks: LinePicks;
  onSave: (l: BudgetLine, withhold: boolean) => Promise<void>;
  onDelete?: () => void;
}) {
  const formId = useId();
  const [d, setD] = useState<BudgetLine>(p.line);
  const [rep, setRep] = useState<Repeat>(() => readRepeat(p.line.repeat));
  // null = follow the line (variable lines are withheld); a tick sets it.
  const [withholdPick, setWithholdPick] = useState<boolean | null>(p.isNew ? null : !p.hasTask);
  const [err, setErr] = useState('');
  const set = (patch: Partial<BudgetLine>) => setD((x) => ({ ...x, ...patch }));
  // New lines take their group from Type and Repeat; an existing line keeps its group unless those change.
  const [touched, setTouched] = useState(p.isNew);
  const section: BudgetSection = touched ? sectionOfLine(d.type, rep) : d.section;
  const withhold = withholdPick ?? section === 'variable';
  const recurring = rep.kind !== 'none';
  const types = az([...PMT_TYPES, d.type]);
  const cats = az([...BUDGET_CATEGORIES, d.category]);
  const pickLabel = (label: string) => {
    const hit = p.picks.links.find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
    setD((x) => ({ ...x, linkLabel: label, link: hit && !(x.link ?? '').trim() ? hit.link : x.link }));
  };

  return (
    <form
      id={formId}
      className="task-form budget-form task-card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.description.trim()) return;
        setErr('');
        let m = { amount: d.amount, foreign: d.foreign ?? null, currency: d.currency || 'CAD' };
        try {
          m = await settleMoney(m);
        } catch (x) {
          return setErr(x instanceof Error ? x.message : 'No rate right now.');
        }
        const rule = writeRepeat(rep);
        await p.onSave(
          {
            ...d,
            section,
            amount: m.amount,
            description: d.description.trim(),
            project: d.project.trim(),
            method: d.method.trim(),
            pmtCategory: d.pmtCategory.trim().toUpperCase(),
            repeat: rule,
            // A repeating line has no single date, except a fixed line that set its day by date.
            date: rule ? null : d.date,
            link: (d.link ?? '').trim(),
            linkLabel: (d.linkLabel ?? '').trim(),
            notes: d.notes.trim()
          },
          withhold
        );
      }}
    >
      <div className="time-grid">
        <div className="field">
          <span>Project</span>
          <TitleCombo value={d.project} titles={p.picks.projects} required={false} placeholder="APP SHOP" onChange={(project) => set({ project })} list="budget:project" />
        </div>
        <MoneyField
          label="Expense"
          value={{ amount: d.amount, foreign: d.foreign ?? null, currency: d.currency || 'CAD' }}
          onChange={(m) => set({ amount: m.amount, foreign: m.currency === 'CAD' ? null : m.foreign, currency: m.currency === 'CAD' ? '' : m.currency })}
        />
      </div>
      <label className="field">
        <span>Line item</span>
        <input value={d.description} autoFocus={p.isNew} required placeholder="Minto International Rent" onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="time-grid">
        <div className="field">
          <span>Pmt method</span>
          <TitleCombo value={d.method} titles={p.picks.methods} required={false} placeholder="ATB" onChange={(method) => set({ method })} list="budget:method" />
        </div>
        <label className="field">
          <span>Pmt type</span>
          <select
            value={d.type}
            onChange={(e) => {
              setTouched(true);
              set({ type: e.target.value });
            }}
          >
            <option value="">—</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="time-grid">
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
          <TitleCombo value={d.pmtCategory} titles={p.picks.pmtCategories} required={false} placeholder="RENT" onChange={(pmtCategory) => set({ pmtCategory })} list="budget:pmt" />
        </div>
      </div>
      <div className={`time-grid task-when${recurring ? ' is-recurring' : ''}`}>
        {!recurring && (
          <label className="field">
            <span>Date</span>
            <input type="date" value={d.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />
          </label>
        )}
        <RepeatPicker
          value={rep}
          from={d.date}
          onChange={(r) => {
            setTouched(true);
            setRep(r);
          }}
        />
      </div>
      <div className="time-grid">
        <label className="field">
          <span>Info link</span>
          <input value={d.link ?? ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://… or 780-555-0123" />
        </label>
        <label className="field">
          <span>Link name</span>
          <input list="line-link-names" autoComplete="off" value={d.linkLabel ?? ''} onChange={(e) => pickLabel(e.target.value)} placeholder="RENTCAFE" />
          <datalist id="line-link-names">
            {p.picks.links.map((x) => (
              <option key={x.label} value={x.label} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="notes-row">
        <label className="field">
          <span>Notes</span>
          <input value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <label className="choice push-pick" title={withhold ? 'Budget only: no task' : 'Saves a linked task too: ticking it off adds this to Expenses'}>
          <input type="checkbox" checked={withhold} onChange={(e) => setWithholdPick(e.target.checked)} />
          <span>Withhold from Task List</span>
        </label>
      </div>
      {err && <p className="field-hint budget-over">{err}</p>}
      <FormActions formId={formId} saveDisabled={!d.description.trim()} onDelete={p.onDelete} deleteLabel="this line" />
    </form>
  );
}
