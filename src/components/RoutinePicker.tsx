import { useEffect, useRef, useState } from 'react';
import { routineLabel, type Routine, type Shift } from '../lib/routines';

type Props = {
  routines: Routine[];
  activeId: string | null;
  shift: Shift;
  onPick: (id: string, shift: Shift) => void;
  onAdd: () => void;
  onEdit: () => void;
};

/** One split button: the active routine on the left, the list on the right. */
export function RoutinePicker({ routines, activeId, shift, onPick, onAdd, onEdit }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const active = routines.find((r) => r.id === activeId) ?? routines[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choices = routines.flatMap((r) =>
    r.flips
      ? (['days', 'nights'] as Shift[]).map((s) => ({ r, s }))
      : [{ r, s: shift }]
  );

  return (
    <div className="picker" ref={wrap}>
      <div className="picker-split">
        <button
          type="button"
          className="picker-main"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {active ? routineLabel(active, shift) : 'Add a routine'}
        </button>
        <button
          type="button"
          className="picker-caret"
          aria-label="Choose a routine"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="picker-menu" role="menu" aria-label="Routines and rituals">
          {choices.map(({ r, s }) => {
            const on = active?.id === r.id && (!r.flips || s === shift);
            return (
              <button
                key={`${r.id}-${r.flips ? s : 'one'}`}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className="picker-item"
                onClick={() => {
                  onPick(r.id, s);
                  setOpen(false);
                }}
              >
                <span>{routineLabel(r, s)}</span>
                <span className="picker-kind">{r.kind === 'ritual' ? 'Ritual' : 'Routine'}</span>
              </button>
            );
          })}
          <div className="picker-rule" />
          {active && (
            <button
              type="button"
              role="menuitem"
              className="picker-item picker-action"
              onClick={() => {
                onEdit();
                setOpen(false);
              }}
            >
              Edit {active.name}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="picker-item picker-action"
            onClick={() => {
              onAdd();
              setOpen(false);
            }}
          >
            + Add routine or ritual
          </button>
        </div>
      )}
    </div>
  );
}
