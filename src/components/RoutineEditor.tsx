import { useEffect, useRef, useState } from 'react';
import type { Routine, RoutineItem } from '../lib/routines';
import { CLOSE_ICON, HeadIcon, SAVE_ICON, TRASH_ICON, useClickOff } from './Sheet';

type Props = {
  open: boolean;
  /** null = a new routine */
  routine: Routine | null;
  nextSort: number;
  onClose: () => void;
  onSave: (r: Routine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Steps a new routine starts with (the 26 Days non-negotiables). */
  baseline: () => string[];
  /** Opens Add timed launch, filled in from this step. */
  onTimed: (label: string, time: string | null) => void;
  /** Adds the step to the 26 Days non-negotiables template. */
  onNonNeg: (label: string) => void;
};

type EditItem = RoutineItem & { k: string };
const withKeys = (items: RoutineItem[]): EditItem[] => items.map((i) => ({ ...i, k: crypto.randomUUID() }));
const emptyItem = (): EditItem => ({ time: null, label: '', k: crypto.randomUUID() });

type Draft = Omit<Routine, 'items'> & { items: EditItem[] };

const blank = (sort: number, baseline: string[]): Draft => ({
  id: crypto.randomUUID(),
  name: '',
  kind: 'routine',
  flips: false,
  shiftStart: null,
  shiftEnd: null,
  wake: null,
  bed: null,
  items: baseline.length ? baseline.map((label) => ({ time: null, label, k: crypto.randomUUID() })) : [emptyItem()],
  sort
});
const toDraft = (r: Routine): Draft => ({ ...r, items: withKeys(r.items) });

export function RoutineEditor({ open, routine, nextSort, onClose, onSave, onDelete, baseline, onTimed, onNonNeg }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const clickOff = useClickOff(onClose);
  const [draft, setDraft] = useState<Draft>(() => (routine ? toDraft(routine) : blank(nextSort, [])));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resort, setResort] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const dragging = useRef<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setResort(false);
    setMenu(null);
    setNote('');
    if (open) setDraft(routine ? toDraft(routine) : blank(nextSort, baseline()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routine, nextSort]);

  // Close a step's ⋯ menu on a click outside it.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.step-menu-wrap')) setMenu(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setItem = (i: number, patch: Partial<RoutineItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const addItem = (at: number) =>
    setDraft((d) => {
      const items = [...d.items];
      items.splice(at + 1, 0, emptyItem());
      return { ...d, items };
    });
  const removeItem = (i: number) => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }));
  const move = (from: number, to: number) =>
    setDraft((d) => {
      if (to < 0 || to >= d.items.length || from === to) return d;
      const items = [...d.items];
      const [it] = items.splice(from, 1);
      items.splice(to, 0, it);
      return { ...d, items };
    });
  const time = (v: string) => (v ? v : null);

  /** Re-sort: drag a row by its handle; the list reorders as you pass the middle of each row. */
  const onDragMove = (e: React.PointerEvent) => {
    const k = dragging.current;
    const rows = listRef.current ? Array.from(listRef.current.children) : [];
    if (!k || !rows.length) return;
    const from = draft.items.findIndex((it) => it.k === k);
    let to = rows.length - 1;
    for (let j = 0; j < rows.length; j++) {
      const b = rows[j].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) {
        to = j;
        break;
      }
    }
    if (to !== from) move(from, to);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    const items: RoutineItem[] = draft.items.filter((i) => i.label.trim()).map(({ time: t, label, nonNegId }) => ({ time: t, label: label.trim(), ...(nonNegId ? { nonNegId } : {}) }));
    await onSave({ ...draft, kind: 'routine', name: draft.name.trim(), items });
    setSaving(false);
    onClose();
  }

  return (
    <dialog ref={ref} className="sheet sheet-wide" onClose={onClose} aria-labelledby="routine-title" {...clickOff}>
      <form onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="routine-title">{routine ? `Edit ${routine.name}` : 'New routine'}</h2>
          <div className="sheet-tools">
            <button type="submit" className="icon-btn tool-btn tool-btn-go" disabled={saving || !draft.name.trim()} aria-label="Save" title="Save">
              <HeadIcon d={SAVE_ICON} />
            </button>
            {routine && (
              <button
                type="button"
                className={`icon-btn tool-btn tool-btn-danger${confirmDelete ? ' is-armed' : ''}`}
                aria-label={confirmDelete ? `Delete ${routine.name} for good` : `Delete ${routine.name}`}
                title={confirmDelete ? 'Click again to delete for good' : 'Delete'}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  await onDelete(routine.id);
                  onClose();
                }}
              >
                <HeadIcon d={TRASH_ICON} />
              </button>
            )}
            <button type="button" className="icon-btn tool-btn" onClick={onClose} aria-label="Close" title="Close">
              <HeadIcon d={CLOSE_ICON} />
            </button>
          </div>
        </div>
        {confirmDelete && <p className="field-hint delete-hint">Click the trash again to delete {routine?.name} for good.</p>}

        <label className="field">
          <span>Name</span>
          <input required value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Relax + Work Vacation" />
        </label>

        <label className="choice choice-wide">
          <input type="checkbox" checked={draft.flips} onChange={(e) => set('flips', e.target.checked)} />
          <span>Duplicate for Night Shift</span>
        </label>
        {draft.flips && <p className="field-hint flip-hint">Write the day times. Night Shift runs the same steps 12 hours later.</p>}

        <div className="time-grid">
          {draft.flips && (
            <>
              <label className="field">
                <span>Shift starts</span>
                <input type="time" value={draft.shiftStart ?? ''} onChange={(e) => set('shiftStart', time(e.target.value))} />
              </label>
              <label className="field">
                <span>Shift ends</span>
                <input type="time" value={draft.shiftEnd ?? ''} onChange={(e) => set('shiftEnd', time(e.target.value))} />
              </label>
            </>
          )}
          <label className="field">
            <span>Wake Up</span>
            <input type="time" value={draft.wake ?? ''} onChange={(e) => set('wake', time(e.target.value))} />
          </label>
          <label className="field">
            <span>Bed</span>
            <input type="time" value={draft.bed ?? ''} onChange={(e) => set('bed', time(e.target.value))} />
          </label>
        </div>

        <fieldset className="field">
          <legend className="sr-only">Steps</legend>
          {resort && (
            <div className="resort-bar">
              <span>Drag a step by its handle to move it.</span>
              <button type="button" className="btn btn-quiet resort-done" onClick={() => setResort(false)}>
                Done
              </button>
            </div>
          )}
          <ol className={`step-rows${resort ? ' is-resort' : ''}${menu ? ' has-menu' : ''}`} ref={listRef}>
            {draft.items.map((it, i) => (
              <li key={it.k} className={`step-row${dragging.current === it.k ? ' is-dragging' : ''}`}>
                {resort && (
                  <button
                    type="button"
                    className="step-handle"
                    aria-label={`Move step ${i + 1}: drag, or use the arrow keys`}
                    title="Drag to move"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragging.current = it.k;
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={() => (dragging.current = null)}
                    onPointerCancel={() => (dragging.current = null)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        move(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
                        requestAnimationFrame(() => (e.target as HTMLElement).focus());
                      }
                    }}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                    </svg>
                  </button>
                )}
                <input
                  type="time"
                  aria-label={`Step ${i + 1} time (optional)`}
                  value={it.time ?? ''}
                  onChange={(e) => setItem(i, { time: time(e.target.value) })}
                />
                <input
                  aria-label={`Step ${i + 1}`}
                  value={it.label}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  placeholder="Step"
                />
                <button type="button" className="icon-btn tool-btn" aria-label={`Add a step after step ${i + 1}`} title="Add a step below" onClick={() => addItem(i)}>
                  <HeadIcon d="M12 5v14M5 12h14" />
                </button>
                <div className="step-menu-wrap">
                  <button
                    type="button"
                    className="icon-btn tool-btn"
                    aria-label={`More for step ${i + 1}`}
                    title="More"
                    aria-haspopup="menu"
                    aria-expanded={menu === it.k}
                    onClick={() => setMenu((m) => (m === it.k ? null : it.k))}
                  >
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                  {menu === it.k && (
                    <div className="row-menu-list step-menu" role="menu" ref={(el) => el?.scrollIntoView({ block: 'nearest' })}>
                      <button type="button" role="menuitem" onClick={() => { setResort(true); setMenu(null); }}>
                        Re-sort
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!it.label.trim()}
                        onClick={() => {
                          setMenu(null);
                          onTimed(it.label.trim(), it.time);
                        }}
                      >
                        Add timed launch
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!it.label.trim()}
                        onClick={() => {
                          setMenu(null);
                          onNonNeg(it.label.trim());
                          setNote(`${it.label.trim()} added to your 26 Days non-negotiables.`);
                        }}
                      >
                        Add non-negotiable
                      </button>
                      <button type="button" role="menuitem" className="menu-danger" onClick={() => { removeItem(i); setMenu(null); }}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {draft.items.length === 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => addItem(-1)}>
              + Add a step
            </button>
          )}
          {note && <p className="field-hint" role="status">{note}</p>}
        </fieldset>

      </form>
    </dialog>
  );
}
