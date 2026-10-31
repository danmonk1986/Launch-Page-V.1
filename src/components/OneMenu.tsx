import { useState } from 'react';

export type OneMenuItem<T extends string> = { id: T; label: string; count?: number };

/**
 * Mobile menu rule (Oct 30): every menu shows one item, the one you're on, with a ∨
 * that drops down all the other selections.
 */
export function OneMenu<T extends string>({
  items,
  value,
  onPick,
  label,
  className = ''
}: {
  items: OneMenuItem<T>[];
  value: T;
  onPick: (id: T) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.id === value) ?? items[0];
  return (
    <div
      className={`row-menu one-menu ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button type="button" className="one-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${current.label}`} onClick={() => setOpen((o) => !o)}>
        <span className="one-menu-label">{current.label}</span>
        {current.count !== undefined && <span className="one-menu-count">{current.count}</span>}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="row-menu-list one-menu-list" role="menu">
          {items
            .filter((i) => i.id !== current.id)
            .map((i) => (
              <button
                key={i.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(i.id);
                }}
              >
                {i.label}
                {i.count !== undefined && <span className="one-menu-count">{i.count}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
