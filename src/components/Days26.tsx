import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { RitualForm, RitualPicker, RitualRunner, duplicateRitual } from './Rituals';
import { TitleCombo, type RocketOption } from './Launchers';
import type { Routine, Shift } from '../lib/routines';
import {
  H2O_SIZES,
  SECTIONS,
  VICE_WEIGHTS,
  activeNonNegs,
  addDays,
  bounceBack,
  checkInTime,
  currentRun,
  currentSection,
  finished,
  flipsNow,
  isDone,
  itemTime,
  loggedFor,
  logsOn,
  modeOf,
  nonNegForRitual,
  readShownRitual,
  ritualKey,
  modeRow,
  readShownQuote,
  resetMinutes,
  routineDay,
  scoreDay,
  shuffleFrom,
  snapshot,
  sum,
  takeaway,
  total,
  viceLimit,
  writeShownQuote,
  writeShownRitual,
  type Config,
  type DayRecord,
  type LogEntry,
  type LogKind,
  type Mode,
  type ModeRow,
  type NonNeg,
  type Quote,
  type Section,
  type SnapItem
} from '../lib/days26';

const PLUS = 'M12 5v14M5 12h14';
const PEN = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4';
const SHUFFLE = 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5';
const CHECK = 'M5 12l5 5L20 7';
const UP = 'M12 19V5M5 12l7-7 7 7';
const DOWN = 'M12 5v14M5 12l7 7 7-7';
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';

const KINDS: { kind: LogKind; label: string; icon: string }[] = [
  { kind: 'productivity', label: 'Productivity', icon: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z' },
  { kind: 'activity', label: 'Activity', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { kind: 'rest', label: 'Rest', icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' },
  { kind: 'food', label: 'Food', icon: 'M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V2c-2.5 1.5-3.5 4-3.5 8h3.5' },
  { kind: 'h2o', label: 'H2O', icon: 'M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z' },
  { kind: 'vices', label: 'Vices', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8' }
];
const kindLabel = (k: LogKind) => KINDS.find((x) => x.kind === k)!.label;

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (x: number) => (Number.isInteger(r2(x)) ? String(r2(x)) : r2(x).toFixed(r2(x * 10) === Math.round(x * 10) ? 1 : 2));
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** The picked clock time nearest the original moment (so 11 PM picked at 1 AM means last night). */
function withTime(refIso: string, t: string) {
  const ref = new Date(refIso);
  const [h, m] = t.split(':').map(Number);
  const c = new Date(ref);
  c.setHours(h, m, 0, 0);
  const diff = c.getTime() - ref.getTime();
  if (diff > 12 * 3_600_000) c.setDate(c.getDate() - 1);
  if (diff < -12 * 3_600_000) c.setDate(c.getDate() + 1);
  return c.toISOString();
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

type Props = {
  now: Date;
  displayName: string;
  routine: Routine | null;
  shift: Shift;
  nonnegs: NonNeg[];
  records: DayRecord[];
  logs: LogEntry[];
  quotes: Quote[];
  config: Config;
  rituals: Routine[];
  /** The daily goal is today's journal theme: change one and both change. */
  goal: string;
  onGoal: (g: string) => void;
  onSaveNonNegs: (list: NonNeg[]) => void;
  onSaveDay: (d: DayRecord) => void;
  onSaveLog: (l: LogEntry) => void;
  onDeleteLog: (id: string) => void;
  onSaveQuote: (q: Quote) => void;
  onDeleteQuote: (id: string) => void;
  onSaveConfig: (c: Config) => void;
  onSaveRitual: (r: Routine) => void;
  onDeleteRitual: (id: string) => void;
  /** What a ritual step can open, and Add new rocket. */
  rockets?: RocketOption[];
  onAddRocket?: (url: string) => Promise<void>;
  /** Ticks something for today: a Non-Negotiable's id or a ritual step's key. */
  onTick: (key: string, on?: boolean) => void;
  /** Today's journal check-ins, for a ritual's check-in step. */
  checkinText: (n: number) => string;
  onCheckin: (n: number, text: string) => void;
};

const RITUAL_SECTION_KEY = 'launchpage.d26.ritualSection';

/** 26 Days: quote + daily goal, Non-Negotiables, Rituals, Logging, Summary. */
export function Days26Page(p: Props) {
  const { now, routine, shift, nonnegs, records, logs, config } = p;
  const mode = modeOf(routine);
  const flip = flipsNow(mode, shift);
  const today = routineDay(now, routine, shift, flip);
  const reset = resetMinutes(routine, shift, flip);
  const rec = records.find((r) => r.day === today) ?? null;
  const items = activeNonNegs(nonnegs);
  const [log, setLog] = useState<{ entry: LogEntry; isNew: boolean } | null>(null);
  const [ritualEdit, setRitualEdit] = useState<{ r: Routine; isNew: boolean } | null>(null);
  const [shownRitual, setShownRitual] = useState<string | null>(readShownRitual);
  const activeRitual = p.rituals.find((r) => r.id === shownRitual) ?? p.rituals[0] ?? null;
  const ritualCard = useRef<HTMLElement>(null);
  const showRitual = (id: string) => {
    setShownRitual(id);
    writeShownRitual(id);
  };
  // Rituals follow the time of day (Oct 20): when the section changes (Morning → Midday →
  // Evening, flipped on nights), show the ritual linked to a Non-Negotiable in that section.
  // Picking one by hand holds until the next section starts.
  const section = currentSection(now, reset, flip);
  useEffect(() => {
    const mark = `${today}:${section}`;
    let last: string | null = null;
    try {
      last = localStorage.getItem(RITUAL_SECTION_KEY);
    } catch {
      /* ignore */
    }
    if (last === mark) return;
    // A ritual set for today leads; otherwise the one for this section.
    const fit = p.rituals.find((r) => r.onDates?.includes(today)) ?? p.rituals.find((r) => nonNegForRitual(nonnegs, r)?.section === section);
    if (!fit && p.rituals.length === 0) return;
    try {
      localStorage.setItem(RITUAL_SECTION_KEY, mark);
    } catch {
      /* ignore */
    }
    if (fit && fit.id !== shownRitual) showRitual(fit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, section, p.rituals.length, nonnegs]);
  const [editList, setEditList] = useState(false);
  const toggle = (id: string, on?: boolean) => p.onTick(id, on);

  const newLog = (kind: LogKind, fill?: Partial<LogEntry>): LogEntry => {
    const d = {
      productivity: { amount: 1, unit: 'blocks', qty: 1 },
      activity: { amount: 10, unit: 'min', qty: 1 },
      rest: { amount: 8, unit: 'h', qty: 1 },
      food: { amount: 0, unit: 'kcal', qty: 1 },
      h2o: { amount: 500, unit: 'ml', qty: 1 },
      vices: { amount: 1, unit: 'load', qty: 1 }
    }[kind];
    return { id: crypto.randomUUID(), day: today, at: new Date().toISOString(), kind, note: '', mode, sort: 0, ...d, ...fill };
  };
  const ritualFor = (label: string) => {
    const l = label.trim().toLowerCase();
    return p.rituals.find((r) => r.name.trim() && (l === r.name.trim().toLowerCase() || l.includes(r.name.trim().toLowerCase()))) ?? null;
  };

  return (
    <div className="d26">
      <div className="d26-top">
        <QuoteCard quotes={p.quotes} onSave={p.onSaveQuote} onDelete={p.onDeleteQuote} />
        <GoalCard goal={p.goal} onGoal={p.onGoal} />
      </div>

      <NonNegCard
        items={items}
        rec={rec}
        records={records}
        logs={logs}
        config={config}
        today={today}
        now={now}
        flip={flip}
        reset={reset}
        mode={mode}
        routine={routine}
        shift={shift}
        onToggle={(n) => {
          const turningOn = !rec?.ticks.includes(n.id);
          toggle(n.id);
          // Oct 22: ticking H2O or a meal opens its log, filled in, so the tick and the log match.
          const k = logKindFor(n.label);
          if (turningOn && k && !n.log) setLog({ entry: newLog(k.kind, k.fill), isNew: true });
        }}
        onLog={(n) => setLog({ entry: newLog(n.log!), isNew: true })}
        ritualFor={ritualFor}
        onOpenRitual={(r) => {
          showRitual(r.id);
          ritualCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onEdit={() => setEditList(true)}
      />

      <section ref={ritualCard} className="panel d26-rituals" aria-labelledby="h-rituals">
        <div className="panel-head">
          <h2 id="h-rituals" className="panel-title">
            Rituals
          </h2>
          <div className="panel-actions">
            <RitualPicker
              rituals={p.rituals}
              activeId={activeRitual?.id ?? null}
              onPick={showRitual}
              onEdit={() => activeRitual && setRitualEdit({ r: activeRitual, isNew: false })}
              onDuplicate={() => activeRitual && setRitualEdit({ r: duplicateRitual(activeRitual, 100 + p.rituals.length), isNew: true })}
              onAdd={() =>
                setRitualEdit({
                  r: { id: crypto.randomUUID(), name: '', kind: 'ritual', flips: false, shiftStart: null, shiftEnd: null, wake: null, bed: null, items: [], sort: 100 + p.rituals.length },
                  isNew: true
                })
              }
            />
          </div>
        </div>
        {activeRitual ? (
          <RitualRunner
            key={activeRitual.id}
            ritual={activeRitual}
            isTicked={(i) => !!rec?.ticks.includes(ritualKey(activeRitual.id, i))}
            onTick={(i, on) => toggle(ritualKey(activeRitual.id, i), on)}
            onSaveRitual={p.onSaveRitual}
            checkinText={p.checkinText}
            onCheckin={p.onCheckin}
            linked={nonNegForRitual(nonnegs, activeRitual)}
            linkedDone={(() => {
              const n = nonNegForRitual(nonnegs, activeRitual);
              return !!n && !!rec?.ticks.includes(n.id);
            })()}
            onDone={() => {
              const n = nonNegForRitual(nonnegs, activeRitual);
              if (n) toggle(n.id, true);
            }}
          />
        ) : (
          <p className="panel-empty">No rituals yet. A ritual has steps but no set time: Rise to Shine, Gratitude, Recover. Add one from the menu at the top right.</p>
        )}
      </section>

      <LoggingCard
        logs={logsOn(logs, today)}
        config={config}
        mode={mode}
        onNew={(k) => setLog({ entry: newLog(k), isNew: true })}
        onOpen={(e) => setLog({ entry: e, isNew: false })}
      />

      <SummaryCard
        displayName={p.displayName}
        records={records}
        logs={logs}
        config={config}
        today={today}
        todayItems={snapshot(nonnegs)}
        rec={rec}
        mode={mode}
      />

      <Sheet open={!!log} title={log ? `${log.isNew ? 'Log' : 'Edit'} ${kindLabel(log.entry.kind)}` : 'Log'} onClose={() => setLog(null)}>
        {log && (
          <LogForm
            entry={log.entry}
            isNew={log.isNew}
            config={config}
            pastNotes={[...new Set(logs.filter((l) => l.kind === log.entry.kind && l.note.trim()).map((l) => (l.kind === 'food' ? splitMeal(l.note).desc : l.note.trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b))}
            pastAmounts={Object.fromEntries(
              logs
                .filter((l) => l.kind === log.entry.kind && l.note.trim())
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((l) => [(l.kind === 'food' ? splitMeal(l.note).desc : l.note.trim()).toLowerCase(), l.amount])
            )}
            onSave={(e) => {
              // The chosen time decides the day; × quantity saves one line each (Productivity stays one line).
              const day = routineDay(new Date(e.at), routine, shift, flip);
              const n = e.kind !== 'productivity' && Number.isInteger(e.qty) && e.qty > 1 ? e.qty : 1;
              for (let i = 0; i < n; i += 1) {
                p.onSaveLog({ ...e, day, qty: n > 1 ? 1 : e.qty, id: i === 0 ? e.id : crypto.randomUUID(), at: new Date(new Date(e.at).getTime() + i * 1000).toISOString() });
              }
              // A note that matches a Non-Negotiable ticks it, as a timed launch does. Oct 22: an H2O
              // log ticks the H2O / water one, and a food log ticks its meal (Breakfast…), note or not.
              const note = e.note.trim().toLowerCase();
              if (day === today && e.kind !== 'vices') {
                const meal = e.kind === 'food' ? splitMeal(e.note).meal.toLowerCase() : '';
                let waterTicked = false;
                for (const n of items) {
                  if (n.log) continue;
                  const label = n.label.trim().toLowerCase();
                  const k = logKindFor(n.label);
                  const byNote = note.length >= 3 && label.length >= 3 && (note.includes(label) || label.includes(note));
                  // One glass ticks the next water Non-Negotiable not yet ticked, not all of them.
                  const water = !!k && k.kind === 'h2o' && e.kind === 'h2o' && !waterTicked && !rec?.ticks.includes(n.id);
                  const byMeal = !!k && k.kind === 'food' && e.kind === 'food' && !!meal && label.includes(meal);
                  if (water) waterTicked = true;
                  if (byNote || water || byMeal) p.onTick(n.id, true);
                }
              }
              if (e.kind === 'vices' && e.note.trim()) {
                const key = e.note.trim().toLowerCase();
                if (config.viceWeights[key] !== e.amount) p.onSaveConfig({ ...config, viceWeights: { ...config.viceWeights, [key]: e.amount } });
              }
              setLog(null);
            }}
            onDelete={() => {
              p.onDeleteLog(log.entry.id);
              setLog(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!ritualEdit} title={ritualEdit?.isNew ? 'Add ritual' : 'Edit ritual'} wide onClose={() => setRitualEdit(null)}>
        {ritualEdit && (
          <RitualForm
            ritual={ritualEdit.r}
            isNew={ritualEdit.isNew}
            rockets={p.rockets}
            onAddRocket={p.onAddRocket}
            onSave={(r) => {
              p.onSaveRitual(r);
              showRitual(r.id);
              setRitualEdit(null);
            }}
            onDelete={() => {
              p.onDeleteRitual(ritualEdit.r.id);
              setRitualEdit(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={editList} title="Non-Negotiables" wide onClose={() => setEditList(false)}>
        {editList && (
          <NonNegEditor
            list={activeNonNegs(nonnegs)}
            config={config}
            onSave={(changed, cfg) => {
              if (changed.length) p.onSaveNonNegs(changed);
              if (cfg.viceLimitHQ !== config.viceLimitHQ || cfg.viceLimitMWD !== config.viceLimitMWD) p.onSaveConfig(cfg);
              setEditList(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

// ---------- Quote + daily goal ----------

function QuoteCard({ quotes, onSave, onDelete }: { quotes: Quote[]; onSave: (q: Quote) => void; onDelete: (id: string) => void }) {
  const [shown, setShown] = useState<string | null>(readShownQuote);
  const sorted = [...quotes].sort((a, b) => a.sort - b.sort);
  const q = sorted.find((x) => x.id === shown) ?? sorted[0] ?? null;
  const [form, setForm] = useState<{ q: Quote; isNew: boolean } | null>(null);
  const show = (id: string | null) => {
    setShown(id);
    if (id) writeShownQuote(id);
  };
  return (
    <section className="panel d26-quote" aria-label="Inspiration">
      <div className="d26-quote-tools">
        <span className="d26-quote-mark" aria-hidden="true">
          “
        </span>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add a quote"
            title="Add a quote"
            onClick={() => setForm({ q: { id: crypto.randomUUID(), text: '', author: '', sort: quotes.length }, isNew: true })}
          >
            <Icon d={PLUS} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Another quote" title="Another quote" disabled={quotes.length < 2} onClick={() => show(shuffleFrom(sorted, q?.id ?? null))}>
            <Icon d={SHUFFLE} />
          </button>
          <button type="button" className="icon-btn tool-btn" aria-label="Edit this quote" title="Edit this quote" disabled={!q} onClick={() => q && setForm({ q, isNew: false })}>
            <Icon d={PEN} />
          </button>
        </div>
      </div>
      {q ? (
        <>
          <blockquote className="d26-quote-text">{q.text}</blockquote>
          {q.author && <p className="d26-quote-by">— {q.author}</p>}
        </>
      ) : (
        <p className="panel-empty d26-quote-empty">Add a quote that keeps you going. Add a few and shuffle between them.</p>
      )}
      <Sheet open={!!form} title={form?.isNew ? 'Add quote' : 'Edit quote'} onClose={() => setForm(null)}>
        {form && (
          <QuoteForm
            quote={form.q}
            isNew={form.isNew}
            onSave={(x) => {
              onSave(x);
              show(x.id);
              setForm(null);
            }}
            onDelete={() => {
              onDelete(form.q.id);
              show(sorted.find((x) => x.id !== form.q.id)?.id ?? null);
              setForm(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

function QuoteForm({ quote, isNew, onSave, onDelete }: { quote: Quote; isNew: boolean; onSave: (q: Quote) => void; onDelete: () => void }) {
  const [d, setD] = useState(quote);
  const formId = useId();
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (d.text.trim()) onSave({ ...d, text: d.text.trim(), author: d.author.trim() });
      }}
    >
      <label className="field">
        <span>Quote</span>
        <textarea value={d.text} rows={4} autoFocus onChange={(e) => setD({ ...d, text: e.target.value })} placeholder="Something that keeps you going" />
      </label>
      <label className="field">
        <span>Who said it</span>
        <input value={d.author} onChange={(e) => setD({ ...d, author: e.target.value })} placeholder="Optional" />
      </label>
      <FormActions formId={formId} saveDisabled={!d.text.trim()} onDelete={isNew ? undefined : onDelete} deleteLabel="this quote" />
    </form>
  );
}

function GoalCard({ goal, onGoal }: { goal: string; onGoal: (g: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(goal);
  useEffect(() => {
    if (!editing) setV(goal);
  }, [goal, editing]);
  const commit = () => {
    setEditing(false);
    if (v.trim() !== goal) onGoal(v.trim());
  };
  return (
    <section
      className="panel d26-goal"
      aria-label="Daily goal"
      style={{ '--goal-len': Math.max(6, ...(editing ? v : goal || 'Set a goal').split(/\s+/).map((w) => w.length)) } as CSSProperties}
    >
      <button type="button" className="icon-btn tool-btn d26-goal-edit" aria-label="Change the daily goal" title="Change the daily goal (it's also the journal theme)" onClick={() => setEditing(true)}>
        <Icon d={PEN} />
      </button>
      {editing ? (
        <input
          className="d26-goal-input"
          value={v}
          autoFocus
          maxLength={40}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setV(goal);
              setEditing(false);
            }
          }}
          placeholder="Today's goal"
          aria-label="Daily goal"
        />
      ) : (
        <button type="button" className={`d26-goal-text${goal ? '' : ' is-empty'}`} onClick={() => setEditing(true)} title="Change the daily goal (it's also the journal theme)">
          {goal || 'Set a goal'}
        </button>
      )}
    </section>
  );
}

// ---------- Non-Negotiables ----------

type NonNegCardProps = {
  items: NonNeg[];
  rec: DayRecord | null;
  records: DayRecord[];
  logs: LogEntry[];
  config: Config;
  today: string;
  now: Date;
  flip: boolean;
  reset: number;
  mode: Mode;
  routine: Routine | null;
  shift: Shift;
  onToggle: (n: NonNeg) => void;
  onLog: (n: NonNeg) => void;
  ritualFor: (label: string) => Routine | null;
  onOpenRitual: (r: Routine) => void;
  onEdit: () => void;
};

function NonNegCard({ items, rec, records, logs, config, today, now, flip, reset, mode, routine, shift, onToggle, onLog, ritualFor, onOpenRitual, onEdit }: NonNegCardProps) {
  const done = (n: NonNeg) => isDone({ id: n.id, label: n.label, log: n.log, target: n.target }, rec, logs, today);
  const count = items.filter(done).length;
  const cur = currentSection(now, reset, flip);
  const weekDays = [...Array(7).keys()].map((i) => addDays(today, i - 6));
  // Last 7 routine days: on baseline, a dip, or nothing recorded; today is the ring.
  const results = finished(records, logs, config, today, null);
  const run = currentRun(results);
  const needed = Math.ceil(items.length * 0.8);
  const vice = sum(logsOn(logs, today, 'vices'));
  const limit = viceLimit(config, mode);
  const inDip = results.length > 0 && !run.on;

  return (
    <section className="panel d26-nonneg" aria-labelledby="h-nonneg">
      <div className="panel-head">
        <h2 id="h-nonneg" className="panel-title">
          Non-Negotiables <span className="d26-count">{count}/{items.length} today</span>
        </h2>
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label="Edit Non-Negotiables" title="Edit Non-Negotiables" onClick={onEdit}>
            <Icon d={PEN} />
          </button>
        </div>
      </div>

      <div className="d26-sections">
        {SECTIONS.map((s) => {
          const list = items.filter((n) => n.section === s.id);
          const isNow = s.id === cur;
          return (
            <div key={s.id} className={`d26-sec${isNow ? ' is-now' : ''}`}>
              <div className="d26-sec-head">
                <h3 className="d26-sec-name">
                  {s.label}
                  {isNow && <span className="d26-now"> · Now</span>}
                </h3>
                <span className="d26-sec-count">
                  {list.filter(done).length}/{list.length}
                </span>
              </div>
              <p className="d26-sec-check">Check-in {checkInTime(s.id as Section, flip)}</p>
              <ul className="d26-list">
                {list.map((n) => {
                  const ok = done(n);
                  const r = n.log ? null : ritualFor(n.label);
                  const time = itemTime(n, routine, shift, flip);
                  const got = n.log ? loggedFor(n, logs, today) : 0;
                  const week = n.perWeek ? weekDays.filter((d) => loggedFor(n, logs, d) >= (n.target || 1)).length : 0;
                  return (
                    <li key={n.id} className={`d26-item${ok ? ' is-done' : ''}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={ok}
                        className={`d26-check${n.log ? ' is-log' : ''}`}
                        aria-label={n.log ? `${n.label}: log it` : n.label}
                        title={n.log ? 'Ticks from the log: tap to log it' : ok ? 'Done: tap to untick' : 'Done, not on time'}
                        onClick={() => (n.log ? onLog(n) : onToggle(n))}
                      >
                        {ok && <Icon d={CHECK} size={14} />}
                      </button>
                      {r ? (
                        <button type="button" className="d26-item-label is-link" onClick={() => onOpenRitual(r)} title={`Open ${r.name}`}>
                          {n.label}
                        </button>
                      ) : n.log ? (
                        <button type="button" className="d26-item-label is-link" onClick={() => onLog(n)} title="Log it">
                          {n.label}
                        </button>
                      ) : (
                        <span className="d26-item-label">{n.label}</span>
                      )}
                      <span className="d26-item-meta">
                        {n.log === 'productivity' && (
                          <span className="d26-prog">
                            {num(got)}/{plural(n.target || 1, 'block')}
                          </span>
                        )}
                        {n.log === 'activity' && (
                          <span className="d26-prog">
                            {Math.round(got)}/{n.target || 30} min
                          </span>
                        )}
                        {n.perWeek ? (
                          <span className="d26-week">
                            {week}/{n.perWeek} wk
                          </span>
                        ) : null}
                        {time && <span className="d26-time">{time}</span>}
                      </span>
                    </li>
                  );
                })}
                {!list.length && <li className="d26-item-empty">Nothing here yet.</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="d26-bounce">
        <ol className="d26-dots" aria-label="Last 7 days">
          {weekDays.map((d) => {
            const rr = records.find((x) => x.day === d);
            const res = rr && d < today && rr.items.length ? scoreDay(rr, logs, config) : null;
            const state = d === today ? 'today' : res ? (res.on ? 'on' : 'dip') : 'none';
            const letter = new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
            return (
              <li key={d} title={`${d}: ${state === 'on' ? 'on baseline' : state === 'dip' ? 'a dip' : state === 'today' ? 'today' : 'no record'}`}>
                <span className={`d26-dot is-${state}`} />
                <span className="d26-dot-day">{letter}</span>
              </li>
            );
          })}
        </ol>
        <div>
          <p className="d26-bounce-title">{inDip ? 'Bounce back today' : 'Stay on baseline'}</p>
          <p className="d26-bounce-sub">
            {count}/{needed} needed · vice load {num(vice)}/{num(limit)}
            {inDip ? ` · dip ${plural(run.n, 'day')}` : run.n ? ` · ${plural(run.n, 'day')} on baseline` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}

function NonNegEditor({ list, config, onSave }: { list: NonNeg[]; config: Config; onSave: (changed: NonNeg[], cfg: Config) => void }) {
  const [rows, setRows] = useState<NonNeg[]>(list);
  const [gone, setGone] = useState<NonNeg[]>([]);
  const [cfg, setCfg] = useState(config);
  const formId = useId();
  const set = (i: number, patch: Partial<NonNeg>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) =>
    setRows((rs) => {
      const j = i + by;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        const kept = rows.filter((r) => r.label.trim()).map((r, i) => ({ ...r, label: r.label.trim(), sort: i }));
        const before = new Map(list.map((n) => [n.id, JSON.stringify(n)]));
        const changed = kept.filter((r) => before.get(r.id) !== JSON.stringify(r));
        // Removed ones are archived, so past days keep their score.
        const archived = [...gone, ...rows.filter((r) => !r.label.trim() && before.has(r.id))].map((r) => ({ ...r, archived: true }));
        onSave([...changed, ...archived], cfg);
      }}
    >
      <p className="field-hint d26-edit-hint">Times are written for Days; MWD Nights flips them. Logged ones tick only from the log. Removing one keeps it in past days.</p>
      <ul className="d26-edit-list">
        {rows.map((n, i) => (
          <li key={n.id} className="d26-edit-row">
            <input className="d26-edit-label" value={n.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Non-Negotiable" aria-label="Name" />
            <select value={n.section} onChange={(e) => set(i, { section: e.target.value as Section })} aria-label="Section">
              {SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={n.timeFrom ?? (n.time ? 'time' : 'none')}
              onChange={(e) => {
                const v = e.target.value;
                set(i, v === 'wake' || v === 'bed' ? { timeFrom: v, time: null } : v === 'none' ? { timeFrom: null, time: null } : { timeFrom: null, time: n.time ?? '09:00' });
              }}
              aria-label="Time"
            >
              <option value="none">No time</option>
              <option value="time">At a time</option>
              <option value="wake">Routine wake</option>
              <option value="bed">Routine bed</option>
            </select>
            {!n.timeFrom && n.time !== null ? (
              <input type="time" value={n.time} onChange={(e) => set(i, { time: e.target.value || null })} aria-label="Time (Days)" />
            ) : (
              <span className="d26-edit-gap" />
            )}
            <select
              value={n.log ?? 'tick'}
              onChange={(e) => {
                const v = e.target.value;
                set(i, v === 'productivity' ? { log: v, target: 1, perWeek: null } : v === 'activity' ? { log: v, target: 30, perWeek: n.perWeek ?? 4 } : { log: null, target: 0, perWeek: null });
              }}
              aria-label="How it ticks"
            >
              <option value="tick">Tick</option>
              <option value="productivity">Log: blocks</option>
              <option value="activity">Log: activity</option>
            </select>
            {n.log ? (
              <label className="d26-edit-target">
                <input type="number" min={n.log === 'productivity' ? 0.25 : 5} step="any" value={n.target} onChange={(e) => set(i, { target: Number(e.target.value) || 0 })} aria-label="Needed a day" />
                <span>{n.log === 'productivity' ? 'blocks' : 'min'}</span>
              </label>
            ) : (
              <span className="d26-edit-gap" />
            )}
            <span className="d26-edit-tools">
              <button type="button" className="icon-btn tool-btn" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon d={UP} />
              </button>
              <button type="button" className="icon-btn tool-btn" aria-label="Move down" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <Icon d={DOWN} />
              </button>
              <button
                type="button"
                className="icon-btn tool-btn tool-btn-danger"
                aria-label={`Remove ${n.label || 'this one'}`}
                title="Remove"
                onClick={() => {
                  if (list.some((x) => x.id === n.id)) setGone((g) => [...g, n]);
                  setRows((rs) => rs.filter((_, j) => j !== i));
                }}
              >
                <Icon d={TRASH} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="journal-toggle d26-edit-add"
        onClick={() =>
          setRows((rs) => [
            ...rs,
            { id: crypto.randomUUID(), label: '', section: rows[rows.length - 1]?.section ?? 'morning', time: null, timeFrom: null, log: null, target: 0, perWeek: null, archived: false, sort: rs.length }
          ])
        }
      >
        <Icon d={PLUS} size={14} />
        Add a Non-Negotiable
      </button>
      <fieldset className="field d26-limits">
        <legend>Vice load limit a day</legend>
        <label>
          HQ <input type="number" min={0} step="any" value={cfg.viceLimitHQ} onChange={(e) => setCfg({ ...cfg, viceLimitHQ: Number(e.target.value) || 0 })} />
        </label>
        <label>
          MWD <input type="number" min={0} step="any" value={cfg.viceLimitMWD} onChange={(e) => setCfg({ ...cfg, viceLimitMWD: Number(e.target.value) || 0 })} />
        </label>
      </fieldset>
      <FormActions formId={formId} />
    </form>
  );
}

// ---------- Logging ----------

function describe(e: LogEntry) {
  const times = e.qty !== 1 ? `${num(e.qty)} × ` : '';
  const note = e.kind !== 'vices' && e.note.trim() ? ` · ${e.note.trim()}` : '';
  switch (e.kind) {
    case 'productivity':
      return plural(e.qty, 'block') + note;
    case 'activity':
      return (e.unit === 'steps' ? `${Math.round(total(e)).toLocaleString()} steps` : `${times}${num(e.amount)} min`) + note;
    case 'rest':
      return (e.unit === 'h' ? `${num(total(e))} h sleep` : `${times}${num(e.amount)} min break`) + note;
    case 'food':
      return `${times}${num(e.amount)} kcal${note}`;
    case 'h2o': {
      const size = H2O_SIZES.find((s) => s.ml === e.amount)?.label ?? `${num(e.amount)} ml`;
      return `${times}${size}${note}`;
    }
    case 'vices': {
      const w = VICE_WEIGHTS.find((x) => x.weight === e.amount)?.label ?? num(e.amount);
      return `${times}${e.note.trim() || 'Vice'} · ${w}`;
    }
  }
}

function LoggingCard({ logs, config, mode, onNew, onOpen }: { logs: LogEntry[]; config: Config; mode: Mode; onNew: (k: LogKind) => void; onOpen: (e: LogEntry) => void }) {
  const big = (k: LogKind, list: LogEntry[]): { value: string; unit: string } => {
    switch (k) {
      case 'productivity':
        return { value: num(sum(list)), unit: 'blocks today' };
      case 'activity': {
        const steps = sum(list.filter((e) => e.unit === 'steps'));
        return { value: String(Math.round(sum(list.filter((e) => e.unit !== 'steps')))), unit: `min today${steps ? ` · ${Math.round(steps).toLocaleString()} steps` : ''}` };
      }
      case 'rest': {
        const breaks = sum(list.filter((e) => e.unit !== 'h'));
        return { value: num(sum(list.filter((e) => e.unit === 'h'))), unit: `hours sleep${breaks ? ` · ${num(breaks)} min breaks` : ''}` };
      }
      case 'food':
        return { value: Math.round(sum(list)).toLocaleString(), unit: 'kcal today' };
      case 'h2o':
        return { value: num(Math.round(sum(list) / 100) / 10), unit: 'L today' };
      case 'vices':
        return { value: num(sum(list)), unit: `load today · limit ${num(viceLimit(config, mode))}` };
    }
  };
  return (
    <section className="panel d26-logging" aria-labelledby="h-logging">
      <div className="panel-head">
        <h2 id="h-logging" className="panel-title">
          Logging
        </h2>
      </div>
      <div className="d26-tiles">
        {KINDS.map((k) => {
          // Timetable order (Oct 20): earliest in the routine day first, like the routine itself.
          const list = logs.filter((e) => e.kind === k.kind).sort((a, b) => (a.at < b.at ? -1 : 1));
          const b = big(k.kind, list);
          const over = k.kind === 'vices' && sum(list) > viceLimit(config, mode);
          return (
            <div key={k.kind} className={`d26-tile${over ? ' is-over' : ''}`}>
              <div className="d26-tile-head">
                <span className="d26-tile-icon">
                  <Icon d={k.icon} size={18} />
                </span>
                <h3 className="d26-tile-name">{k.label}</h3>
                <button type="button" className="icon-btn tool-btn" aria-label={`Log ${k.label}`} title={`Log ${k.label}`} onClick={() => onNew(k.kind)}>
                  <Icon d={PLUS} />
                </button>
              </div>
              <p className="d26-tile-big">{b.value}</p>
              <p className="d26-tile-unit">{b.unit}</p>
              {list.length ? (
                <ul className="d26-entries">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="d26-entry" onClick={() => onOpen(e)} title="Edit this log">
                        <span className="d26-entry-time">{clock(e.at)}</span>
                        <span className="d26-entry-text">{describe(e)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="d26-tile-empty">Nothing logged yet today</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stepper({ value, step, min, onChange, label }: { value: number; step: number; min: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="d26-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less (${label})`} disabled={value <= min} onClick={() => onChange(Math.max(min, r2(value - step)))}>
        −
      </button>
      <span className="d26-stepper-val" aria-live="polite">
        × {num(value)}
      </span>
      <button type="button" aria-label={`More (${label})`} onClick={() => onChange(r2(value + step))}>
        +
      </button>
    </div>
  );
}

function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="d26-pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className="d26-pill" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** A Non-Negotiable that is really a log: H2O / water, or a meal (Breakfast, Lunch, Dinner, Snack). */
function logKindFor(label: string): { kind: LogKind; fill: Partial<LogEntry> } | null {
  const l = label.trim().toLowerCase();
  if (/\bh2o\b|\bwater\b/.test(l)) return { kind: 'h2o', fill: {} };
  const meal = MEALS.find((m) => new RegExp(`\\b${m.toLowerCase()}\\b`).test(l));
  return meal ? { kind: 'food', fill: { note: meal } } : null;
}

/** A food note is saved as "Meal · Description" (the meal is optional). */
export function splitMeal(note: string): { meal: string; desc: string } {
  const v = note.trim();
  const m = MEALS.find((x) => v.toLowerCase() === x.toLowerCase() || v.toLowerCase().startsWith(`${x.toLowerCase()} · `));
  return m ? { meal: m, desc: v.slice(m.length).replace(/^\s*·\s*/, '') } : { meal: '', desc: v };
}
const joinMeal = (meal: string, desc: string) => [meal, desc.trim()].filter(Boolean).join(' · ');

function LogForm({ entry, isNew, config, pastNotes, pastAmounts, onSave, onDelete }: { entry: LogEntry; isNew: boolean; config: Config; pastNotes: string[]; pastAmounts: Record<string, number>; onSave: (e: LogEntry) => void; onDelete: () => void }) {
  const [d, setD] = useState(entry);
  const [food, setFood] = useState(() => splitMeal(entry.note));
  const setFoodPart = (patch: Partial<{ meal: string; desc: string }>) => {
    const f = { ...food, ...patch };
    setFood(f);
    const known = patch.desc !== undefined ? pastAmounts[patch.desc.trim().toLowerCase()] : undefined;
    set(known !== undefined ? { note: joinMeal(f.meal, f.desc), amount: known } : { note: joinMeal(f.meal, f.desc) });
  };
  const [when, setWhen] = useState(() => hhmm(entry.at));
  const formId = useId();
  const set = (patch: Partial<LogEntry>) => setD((x) => ({ ...x, ...patch }));
  const valid = d.amount > 0 && d.qty > 0 && (d.kind !== 'vices' || !!d.note.trim());
  // Any amount is fine (700 kcal, a 22-minute break): no step rule for the browser to enforce.
  const amountField = (label: string, min: number) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={min} step="any" value={d.amount || ''} onChange={(e) => set({ amount: Number(e.target.value) || 0 })} />
    </label>
  );
  return (
    <form
      id={formId}
      className="d26-log-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && when) onSave({ ...d, at: withTime(entry.at, when), note: d.note.trim() });
      }}
    >
      {d.kind === 'productivity' && (
        <div className="field">
          <span>Blocks · 1.5 hours each, quarter blocks allowed</span>
          <Stepper value={d.qty} step={0.25} min={0.25} onChange={(v) => set({ qty: v })} label="Blocks" />
        </div>
      )}

      {d.kind === 'activity' && (
        <>
          <Pills value={d.unit} label="Count in" options={[{ v: 'min', label: 'Minutes' }, { v: 'steps', label: 'Steps' }]} onChange={(u) => set({ unit: u, amount: u === 'steps' ? 1000 : 10 })} />
          {amountField(d.unit === 'steps' ? 'Steps' : 'Minutes', 1)}
        </>
      )}

      {d.kind === 'rest' && (
        <>
          <Pills value={d.unit} label="Kind of rest" options={[{ v: 'h', label: 'Sleep (hours)' }, { v: 'min', label: 'Break (minutes)' }]} onChange={(u) => set({ unit: u, amount: u === 'h' ? 8 : 15 })} />
          {amountField(d.unit === 'h' ? 'Hours' : 'Minutes', d.unit === 'h' ? 0.25 : 1)}
        </>
      )}

      {d.kind === 'food' && (
        <>
          <label className="field">
            <span>Meal</span>
            <select value={food.meal} onChange={(e) => setFoodPart({ meal: e.target.value })}>
              <option value="">—</option>
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Description · picking one you've had before fills its calories</span>
            <TitleCombo value={food.desc} titles={pastNotes} required={false} autoFocus={isNew} placeholder="Bowl of Special K Red Berries with Oat Milk" onChange={(desc) => setFoodPart({ desc })} />
          </div>
        </>
      )}

      {d.kind === 'h2o' && (
        <Pills value={d.amount} label="Size" options={H2O_SIZES.map((s) => ({ v: s.ml, label: `${s.label} · ${s.ml} ml` }))} onChange={(ml) => set({ amount: ml })} />
      )}

      {d.kind === 'vices' && (
        <>
          <div className="field">
            <span>What was it</span>
            <TitleCombo
              value={d.note}
              titles={pastNotes}
              autoFocus={isNew}
              placeholder="A pack of gum, a heavy night…"
              onChange={(note) => {
                const w = config.viceWeights[note.trim().toLowerCase()];
                set(w !== undefined ? { note, amount: w } : { note });
              }}
            />
          </div>
          <Pills value={d.amount} label="Weight" options={VICE_WEIGHTS.map((w) => ({ v: w.weight, label: `${w.label} · ${w.weight}` }))} onChange={(w) => set({ amount: w })} />
        </>
      )}

      {d.kind !== 'productivity' && (
        <div className="field">
          <span>How many · each one is its own line</span>
          <Stepper value={d.qty} step={1} min={1} onChange={(v) => set({ qty: v })} label="Quantity" />
        </div>
      )}

      {d.kind === 'food' && (
        <div className="field">
          <span>Calories (kcal) · each</span>
          <div className="d26-kcal">
            <input type="number" inputMode="decimal" min={1} step="any" value={d.amount || ''} onChange={(e) => set({ amount: Number(e.target.value) || 0 })} aria-label="Calories each" />
            <a
              className="btn d26-kcal-look"
              href={`https://www.google.com/search?q=${encodeURIComponent(`calories in ${food.desc.trim() || 'food'}`)}`}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!food.desc.trim()}
              title="Search the calories for this description in a new tab"
            >
              Estimate ↗
            </a>
          </div>
        </div>
      )}

      {d.kind !== 'vices' && d.kind !== 'food' && (
        <div className="field">
          <span>Note · matching a Non-Negotiable ticks it</span>
          <TitleCombo value={d.note} titles={pastNotes} required={false} placeholder="Optional" onChange={(note) => set({ note })} />
        </div>
      )}

      <label className="field d26-log-time">
        <span>Time</span>
        <input type="time" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <p className="d26-log-total" aria-live="polite">
        = {valid || d.kind === 'productivity' ? describe(d) : '…'}
        {d.kind !== 'productivity' && Number.isInteger(d.qty) && d.qty > 1 && <span className="d26-log-when"> · {d.qty} lines</span>}
      </p>
      <FormActions formId={formId} saveDisabled={!valid} onDelete={isNew ? undefined : onDelete} deleteLabel="this log" />
    </form>
  );
}

// ---------- Summary ----------

function SummaryCard({
  displayName,
  records,
  logs,
  config,
  today,
  todayItems,
  rec,
  mode
}: {
  displayName: string;
  records: DayRecord[];
  logs: LogEntry[];
  config: Config;
  today: string;
  todayItems: SnapItem[];
  rec: DayRecord | null;
  mode: Mode;
}) {
  const [range, setRange] = useState<7 | 26 | 0>(7);
  const rs = finished(records, logs, config, today, range || null);
  const run = currentRun(finished(records, logs, config, today, null));
  const on = rs.filter((r) => r.on).length;
  const vicePerDay = rs.length ? rs.reduce((a, r) => a + r.vice, 0) / rs.length : 0;
  const bb = bounceBack(rs);
  const hq = modeRow('HQ', rs.filter((r) => r.mode === 'HQ'));
  const mwd = modeRow('MWD', rs.filter((r) => r.mode === 'MWD'));
  const mDays = modeRow('MWD · Days', rs.filter((r) => r.mode === 'MWD' && r.shift === 'days'));
  const mNights = modeRow('MWD · Nights', rs.filter((r) => r.mode === 'MWD' && r.shift === 'nights'));
  const take = takeaway(hq, mwd);
  // Today so far.
  const tDone = todayItems.filter((i) => isDone(i, rec, logs, today)).length;
  const tVice = sum(logsOn(logs, today, 'vices'));
  const tLimit = viceLimit(config, mode);
  const tBlocks = sum(logsOn(logs, today, 'productivity'));
  const tOn = todayItems.length > 0 && tDone / todayItems.length >= 0.8 && tVice <= tLimit;

  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  const one = (x: number | null) => (x === null ? '—' : num(Math.round(x * 10) / 10));
  type Col = { key: keyof ModeRow; label: string; fmt: (r: ModeRow) => string; higher: boolean };
  const cols: Col[] = [
    { key: 'days', label: 'Days', fmt: (r) => (r.days ? String(r.days) : '—'), higher: true },
    { key: 'onPct', label: 'On baseline', fmt: (r) => pct(r.onPct), higher: true },
    { key: 'nonNegPct', label: 'Non-Neg.', fmt: (r) => pct(r.nonNegPct), higher: true },
    { key: 'vice', label: 'Vice load / day', fmt: (r) => one(r.vice), higher: false },
    { key: 'blocks', label: 'Blocks / day', fmt: (r) => one(r.blocks), higher: true },
    { key: 'activityDays', label: 'Activity days', fmt: (r) => (r.activityDays === null ? '—' : String(r.activityDays)), higher: true }
  ];
  // Teal marks the better of HQ and MWD in each column (days is just a count).
  const best = (c: Col, r: ModeRow) => {
    if (c.key === 'days' || !hq.days || !mwd.days) return false;
    const a = hq[c.key] as number | null;
    const b = mwd[c.key] as number | null;
    if (a === null || b === null || a === b) return false;
    const mine = r.label === 'HQ' ? a : b;
    const other = r.label === 'HQ' ? b : a;
    return c.higher ? mine > other : mine < other;
  };

  return (
    <section className="panel d26-summary" aria-labelledby="h-summary">
      <div className="panel-head">
        <div>
          <h2 id="h-summary" className="panel-title">
            Summary
          </h2>
          <p className="panel-sub">What makes Work {displayName || 'Dan'} function, and what comes home to HQ?</p>
        </div>
        <div className="d26-range" role="group" aria-label="Period">
          {([7, 26, 0] as const).map((n) => (
            <button key={n} type="button" aria-pressed={range === n} onClick={() => setRange(n)}>
              {n ? `${n} days` : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="d26-stats">
        <div className="d26-stat">
          <p className="d26-stat-label">On baseline</p>
          <p className="d26-stat-big">{rs.length ? pct(on / rs.length) : '—'}</p>
          <p className="d26-stat-sub">{plural(rs.length, 'finished day')}</p>
        </div>
        <div className="d26-stat">
          <p className="d26-stat-label">Current run</p>
          <p className="d26-stat-big">{run.on ? run.n : 0}</p>
          <p className="d26-stat-sub">{run.n === 0 ? 'starts after your first full day' : run.on ? 'days on baseline' : `in a dip · ${plural(run.n, 'day')}`}</p>
        </div>
        <div className="d26-stat">
          <p className="d26-stat-label">Vice load / day</p>
          <p className="d26-stat-big">{one(rs.length ? vicePerDay : null)}</p>
          <p className="d26-stat-sub">{num(Math.round(vicePerDay * 7 * 10) / 10)} per week</p>
        </div>
        <div className="d26-stat">
          <p className="d26-stat-label">Bounce-back</p>
          <p className="d26-stat-big">{bb === null ? '—' : num(Math.round(bb * 10) / 10)}</p>
          <p className="d26-stat-sub">{bb === null ? 'no dips recovered yet' : 'days to get back on baseline'}</p>
        </div>
      </div>

      <div className="d26-compare">
        <h3 className="d26-compare-title">HQ vs MWD</h3>
        <div className="d26-table-wrap">
          <table className="d26-table">
            <thead>
              <tr>
                <th scope="col">Mode</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[hq, mwd, ...(mDays.days ? [mDays] : []), ...(mNights.days ? [mNights] : [])].map((r) => (
                <tr key={r.label} className={r.label.includes('·') ? 'is-sub' : ''}>
                  <th scope="row">{r.label}</th>
                  {cols.map((c) => (
                    <td key={c.key} className={best(c, r) ? 'is-best' : ''}>
                      {c.fmt(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="d26-takeaway">{take ?? 'Teal marks the better mode in each column. A takeaway appears once you have at least 3 finished days in both HQ and MWD.'}</p>
      </div>

      <div className="d26-today">
        <span className="d26-today-title">Today so far</span>
        <span>
          Non-Negotiables <b>{tDone}/{todayItems.length}</b>
        </span>
        <span>
          Vice load <b>{num(tVice)}/{num(tLimit)}</b>
        </span>
        <span>
          Blocks <b>{num(tBlocks)}</b>
        </span>
        <span className={`d26-today-state${tOn ? ' is-on' : ''}`}>{tOn ? 'On baseline' : 'Not on baseline yet'}</span>
      </div>
    </section>
  );
}
