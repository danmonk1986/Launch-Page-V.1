import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
};

/** A modal dialog in the LaunchPage style. Escape and the × close it. */
export function Sheet({ open, title, onClose, wide, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `sheet-${title.replace(/\W+/g, '-').toLowerCase()}`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`sheet${wide ? ' sheet-wide' : ''}`} onClose={onClose} aria-labelledby={titleId}>
      <div className="sheet-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
