import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { FormActions } from './Sheet';
import { Icon } from './Tasks';
import type { Routine, RoutineItem } from '../lib/routines';
import type { NonNeg } from '../lib/days26';

const CHECK = 'M5 12l5 5L20 7';
const PLAY = 'M7 4v16l13-8z';
const PAUSE = 'M7 4h4v16H7zM13 4h4v16h-4z';
const REPLAY = 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5';
const CLOSE = 'M6 6l12 12M18 6L6 18';
const LINK = 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1';
const PLUS = 'M12 5v14M5 12h14';
const UP = 'M12 19V5M5 12l7-7 7 7';
const DOWN = 'M12 5v14M5 12l7 7 7-7';
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';

export type StepType = NonNullable<RoutineItem['type']>;

/** A step's type: as set, or read from its name for older rituals ("Meditation", "Check In #1"). */
export function stepType(s: RoutineItem): { type: StepType; checkin: number } {
  const n = /check[\s-]*in\s*#?\s*(\d+)/i.exec(s.label);
  if (s.type) return { type: s.type, checkin: s.checkin ?? (n ? Number(n[1]) : 1) };
  if (n) return { type: 'checkin', checkin: Number(n[1]) };
  // Meditation, however it's spelled ("Meidation" too).
  if (/\bme[di]{1,2}[a-z]*tion\b|\bmedit/i.test(s.label)) return { type: 'meditation', checkin: 1 };
  return { type: 'step', checkin: 1 };
}

const safeUrl = (u?: string) => {
  const v = (u ?? '').trim();
  if (!v) return null;
  if (/^(javascript|data|file|vbscript):/i.test(v)) return null;
  return /^[a-z][\w+.-]*:/i.test(v) ? v : `https://${v}`;
};

type RunnerProps = {
  ritual: Routine;
  isTicked: (i: number) => boolean;
  onTick: (i: number, on?: boolean) => void;
  onSaveRitual: (r: Routine) => void;
  checkinText: (n: number) => string;
  onCheckin: (n: number, text: string) => void;
  linked: NonNeg | null;
  linkedDone: boolean;
  onDone: () => void;
};

/** The ritual's steps side by side: tick each one off, open its link, play the meditation, write the check-in. */
export function RitualRunner({ ritual, isTicked, onTick, onSaveRitual, checkinText, onCheckin, linked, linkedDone, onDone }: RunnerProps) {
  const steps = ritual.items.map((s, i) => ({ s, i })).filter(({ s }) => s.label.trim());
  const done = steps.filter(({ i }) => isTicked(i)).length;
  const [playing, setPlaying] = useState<number | null>(null);
  const all = steps.length > 0 && done === steps.length;
  const setScript = (i: number, script: string) => onSaveRitual({ ...ritual, items: ritual.items.map((x, j) => (j === i ? { ...x, script } : x)) });

  if (!steps.length) return <p className="panel-empty">No steps yet. Tap the pencil to add them.</p>;
  return (
    <div className="rit">
      <p className="rit-progress">
        {done}/{steps.length} done
      </p>
      <ol className="rit-steps">
        {steps.map(({ s, i }, n) => {
          const { type, checkin } = stepType(s);
          const ok = isTicked(i);
          const url = safeUrl(s.url);
          return (
            <li key={i} className={`rit-step is-${type}${ok ? ' is-done' : ''}`}>
              <div className="rit-step-top">
                <span className="rit-num">{n + 1}</span>
                <button type="button" role="checkbox" aria-checked={ok} className="d26-check" aria-label={s.label} onClick={() => onTick(i)}>
                  {ok && <Icon d={CHECK} size={14} />}
                </button>
              </div>
              {type === 'meditation' ? (
                <button type="button" className="rit-label is-link" onClick={() => setPlaying(i)} title="Play the meditation">
                  <Icon d={PLAY} size={14} /> {s.label}
                </button>
              ) : url ? (
                <a className="rit-label is-link" href={url} target="_blank" rel="noopener noreferrer" title={`Open ${url}`}>
                  {s.label} <Icon d={LINK} size={13} />
                </a>
              ) : (
                <span className="rit-label">{s.label}</span>
              )}
              {type === 'meditation' && <SaveOnBlur className="rit-text" value={s.script ?? ''} placeholder="The words that play up the screen" label={`${s.label} script`} onSave={(v) => setScript(i, v)} />}
              {type === 'checkin' && (
                <SaveOnBlur
                  className="rit-text"
                  value={checkinText(checkin)}
                  placeholder={`Journal ✓ check in #${checkin}: now or later`}
                  label={`Journal check in ${checkin}`}
                  onSave={(v) => {
                    onCheckin(checkin, v);
                    if (v.trim() && !ok) onTick(i, true);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className={`btn rit-done${all ? '' : ' btn-quiet'}`} onClick={onDone}>
        {linked ? (linkedDone ? `Done · ${linked.label} is ticked` : `Done · tick ${linked.label}`) : 'Done'}
      </button>
      {playing !== null && (
        <MeditationCrawl
          title={ritual.items[playing]?.label ?? 'Meditation'}
          script={ritual.items[playing]?.script ?? ''}
          onClose={() => setPlaying(null)}
          onCheck={() => {
            onTick(playing, true);
            setPlaying(null);
          }}
        />
      )}
    </div>
  );
}

/** A text box that saves when you leave it (and as you pause typing). */
function SaveOnBlur({ value, onSave, placeholder, label, className }: { value: string; onSave: (v: string) => void; placeholder: string; label: string; className: string }) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) setV(value);
  }, [value]);
  const flush = () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    onSave(v);
  };
  return (
    <textarea
      className={className}
      value={v}
      rows={4}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        dirty.current = true;
        setV(e.target.value);
        window.clearTimeout(timer.current);
        const next = e.target.value;
        timer.current = window.setTimeout(() => {
          dirty.current = false;
          onSave(next);
        }, 1200);
      }}
      onBlur={flush}
    />
  );
}

/** The meditation plays up the screen, like a film's opening crawl. ✓ checks it off. */
export function MeditationCrawl({ title, script, onClose, onCheck }: { title: string; script: string; onClose: () => void; onCheck: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [ended, setEnded] = useState(false);
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(30, Math.round(words * 0.6));
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="crawl" onClose={onClose} aria-label={title}>
      <div className="crawl-sky" aria-hidden="true">
        <div className="crawl-floor" />
        <div className="crawl-snow" />
      </div>
      <div className="crawl-tools">
        <button type="button" className={`icon-btn tool-btn${ended ? ' tool-btn-go' : ''}`} aria-label="Check it off" title="Check it off" onClick={onCheck}>
          <Icon d={CHECK} />
        </button>
        <button type="button" className="icon-btn tool-btn" aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onClick={() => setPaused((x) => !x)}>
          <Icon d={paused ? PLAY : PAUSE} />
        </button>
        <button
          type="button"
          className="icon-btn tool-btn"
          aria-label="Play from the start"
          title="Play from the start"
          onClick={() => {
            setRun((n) => n + 1);
            setPaused(false);
            setEnded(false);
          }}
        >
          <Icon d={REPLAY} />
        </button>
        <button type="button" className="icon-btn tool-btn" aria-label="Close" title="Close" onClick={() => ref.current?.close()}>
          <Icon d={CLOSE} />
        </button>
      </div>
      <div className="crawl-stage">
        <div className="crawl-plane">
          <div
            key={run}
            className="crawl-text"
            style={{ '--crawl-dur': `${seconds}s`, animationPlayState: paused ? 'paused' : 'running' } as CSSProperties}
            onAnimationEnd={() => setEnded(true)}
          >
            <p className="crawl-title">{title}</p>
            {script.trim() ? script : 'No words yet. Close this, write the meditation under the step, and play it again.'}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** The ritual on the card: its name, with every ritual in the list (like the routine picker). */
export function RitualPicker({ rituals, activeId, onPick, onAdd, onEdit }: { rituals: Routine[]; activeId: string | null; onPick: (id: string) => void; onAdd: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const active = rituals.find((r) => r.id === activeId) ?? null;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="picker rit-picker" ref={wrap}>
      <div className="picker-split">
        <button type="button" className="picker-main" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {active ? active.name : rituals.length ? 'Pick a ritual' : 'Add a ritual'}
        </button>
        <button type="button" className="picker-caret" aria-label="Choose a ritual" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="picker-menu" role="menu" aria-label="Rituals">
          {rituals.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitemradio"
              aria-checked={r.id === active?.id}
              className="picker-item"
              onClick={() => {
                onPick(r.id);
                setOpen(false);
              }}
            >
              <span>{r.name || 'Untitled'}</span>
            </button>
          ))}
          {rituals.length > 0 && <div className="picker-rule" />}
          <div className="picker-tools">
            {active && (
              <button
                type="button"
                role="menuitem"
                className="icon-btn tool-btn"
                aria-label={`Edit ${active.name}`}
                title={`Edit ${active.name}`}
                onClick={() => {
                  onEdit();
                  setOpen(false);
                }}
              >
                <Icon d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="icon-btn tool-btn"
              aria-label="Add a ritual"
              title="Add a ritual"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              <Icon d={PLUS} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Draft = RoutineItem & { k: string };

/** Name and steps; each step can be a plain step, a meditation or a journal check-in, with a link. */
export function RitualForm({ ritual, isNew, onSave, onDelete }: { ritual: Routine; isNew: boolean; onSave: (r: Routine) => void; onDelete: () => void }) {
  const [name, setName] = useState(ritual.name);
  const [rows, setRows] = useState<Draft[]>(() => {
    const list = ritual.items.map((s) => ({ ...s, ...(() => {
      const t = stepType(s);
      return { type: t.type, checkin: t.type === 'checkin' ? t.checkin : undefined };
    })(), k: crypto.randomUUID() }));
    return list.length ? list : [{ time: null, label: '', type: 'step', k: crypto.randomUUID() }];
  });
  const formId = useId();
  const set = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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
        if (!name.trim()) return;
        const items: RoutineItem[] = rows
          .filter((r) => r.label.trim())
          .map((r) => {
            const out: RoutineItem = { time: null, label: r.label.trim(), type: r.type ?? 'step' };
            if (r.url?.trim()) out.url = r.url.trim();
            if (r.type === 'meditation') out.script = r.script ?? '';
            if (r.type === 'checkin') out.checkin = Math.max(1, r.checkin ?? 1);
            return out;
          });
        onSave({ ...ritual, kind: 'ritual', name: name.trim(), items });
      }}
    >
      <label className="field">
        <span>Name</span>
        <input value={name} autoFocus={isNew} onChange={(e) => setName(e.target.value)} placeholder="Rise to Shine" />
      </label>
      <div className="field">
        <span>Steps</span>
        <ol className="rit-edit-list">
          {rows.map((r, i) => (
            <li key={r.k} className="rit-edit-row">
              <div className="rit-edit-main">
                <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1}`} />
                <select value={r.type ?? 'step'} onChange={(e) => set(i, { type: e.target.value as StepType, checkin: e.target.value === 'checkin' ? r.checkin ?? 1 : undefined })} aria-label="Kind of step">
                  <option value="step">Step</option>
                  <option value="meditation">Meditation</option>
                  <option value="checkin">Journal check-in</option>
                </select>
                <span className="d26-edit-tools">
                  <button type="button" className="icon-btn tool-btn" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon d={UP} />
                  </button>
                  <button type="button" className="icon-btn tool-btn" aria-label="Move down" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <Icon d={DOWN} />
                  </button>
                  <button type="button" className="icon-btn tool-btn tool-btn-danger" aria-label="Remove step" title="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Icon d={TRASH} />
                  </button>
                </span>
              </div>
              {(r.type ?? 'step') === 'step' && <input value={r.url ?? ''} onChange={(e) => set(i, { url: e.target.value })} placeholder="Link it opens (optional): headway.app" aria-label="Link" />}
              {r.type === 'meditation' && (
                <textarea value={r.script ?? ''} rows={4} onChange={(e) => set(i, { script: e.target.value })} placeholder="The words that play up the screen" aria-label="Meditation script" />
              )}
              {r.type === 'checkin' && (
                <label className="rit-edit-num">
                  Journal check in #
                  <input type="number" min={1} step={1} value={r.checkin ?? 1} onChange={(e) => set(i, { checkin: Number(e.target.value) || 1 })} />
                </label>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="journal-toggle" onClick={() => setRows((rs) => [...rs, { time: null, label: '', type: 'step', k: crypto.randomUUID() }])}>
          <Icon d={PLUS} size={14} />
          Add a step
        </button>
      </div>
      <p className="field-hint">A Non-Negotiable with the same name (like “Rise to Shine Ritual”) opens this ritual, and Done ticks it. A timed launch can open it too: pick it under Ritual in the timed launch.</p>
      <FormActions formId={formId} saveDisabled={!name.trim()} onDelete={isNew ? undefined : onDelete} deleteLabel="this ritual" />
    </form>
  );
}
