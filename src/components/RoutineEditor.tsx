import { useEffect, useRef, useState } from 'react';
import type { Kind, Routine, RoutineItem } from '../lib/routines';

type Props = {
  open: boolean;
  /** null = a new routine */
  routine: Routine | null;
  nextSort: number;
  onClose: () => void;
  onSave: (r: Routine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const blank = (sort: number): Routine => ({
  id: crypto.randomUUID(),
  name: '',
  kind: 'routine',
  flips: false,
  shiftStart: null,
  shiftEnd: null,
  wake: null,
  bed: null,
  items: [{ time: null, label: '' }],
  sort
});

export function RoutineEditor({ open, routine, nextSort, onClose, onSave, onDelete }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Routine>(() => routine ?? blank(nextSort));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    if (open) setDraft(routine ? { ...routine, items: routine.items.map((i) => ({ ...i })) } : blank(nextSort));
  }, [open, routine, nextSort]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof Routine>(k: K, v: Routine[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setItem = (i: number, patch: Partial<RoutineItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const addItem = (at: number) =>
    setDraft((d) => {
      const items = [...d.items];
      items.splice(at + 1, 0, { time: null, label: '' });
      return { ...d, items };
    });
  const removeItem = (i: number) => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }));
  const time = (v: string) => (v ? v : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    await onSave({ ...draft, name: draft.name.trim(), items: draft.items.filter((i) => i.label.trim()) });
    setSaving(false);
    onClose();
  }

  return (
    <dialog ref={ref} className="sheet sheet-wide" onClose={onClose} aria-labelledby="routine-title">
      <form onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="routine-title">{routine ? `Edit ${routine.name}` : 'New routine or ritual'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="field">
          <span>Name</span>
          <input required value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Relax + Work Vacation" />
        </label>

        <fieldset className="field">
          <legend>Type</legend>
          <div className="choice-row">
            {(['routine', 'ritual'] as Kind[]).map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="kind" checked={draft.kind === k} onChange={() => set('kind', k)} />
                <span>{k === 'routine' ? 'Routine (has times)' : 'Ritual (no times)'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="choice choice-wide">
          <input type="checkbox" checked={draft.flips} onChange={(e) => set('flips', e.target.checked)} />
          <span>Days and Nights shifts: write times for Days, Nights flips them by 12 hours</span>
        </label>

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
            <span>Wake</span>
            <input type="time" value={draft.wake ?? ''} onChange={(e) => set('wake', time(e.target.value))} />
          </label>
          <label className="field">
            <span>Bed by</span>
            <input type="time" value={draft.bed ?? ''} onChange={(e) => set('bed', time(e.target.value))} />
          </label>
        </div>

        <fieldset className="field">
          <legend>Steps (leave the time empty to group a step under the one above)</legend>
          <ol className="step-rows">
            {draft.items.map((it, i) => (
              <li key={i} className="step-row">
                <input
                  type="time"
                  aria-label={`Step ${i + 1} time`}
                  value={it.time ?? ''}
                  onChange={(e) => setItem(i, { time: time(e.target.value) })}
                />
                <input
                  aria-label={`Step ${i + 1}`}
                  value={it.label}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  placeholder="Step"
                />
                <button type="button" className="icon-btn" aria-label={`Add a step after step ${i + 1}`} onClick={() => addItem(i)}>
                  +
                </button>
                <button type="button" className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => removeItem(i)}>
                  −
                </button>
              </li>
            ))}
          </ol>
          {draft.items.length === 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => addItem(-1)}>
              + Add a step
            </button>
          )}
        </fieldset>

        <div className="sheet-actions sheet-actions-split">
          {routine ? (
            <button
              type="button"
              className="btn btn-quiet btn-danger"
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                await onDelete(routine.id);
                onClose();
              }}
            >
              {confirmDelete ? `Delete ${routine.name} for good` : 'Delete'}
            </button>
          ) : (
            <span />
          )}
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving || !draft.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
