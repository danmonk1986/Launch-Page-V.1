import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
};

/** Where a form's Save and Delete icons go: the sheet's header, left of the ×. */
const ToolSlot = createContext<HTMLElement | null>(null);

export function HeadIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const SAVE_ICON = 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v5h7V3M7 21v-7h10v7';
export const TRASH_ICON = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3';
export const CLOSE_ICON = 'M6 6l12 12M18 6L6 18';

/** A modal dialog in the LaunchPage style. Escape and the × close it. */
export function Sheet({ open, title, onClose, wide, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
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
        <div className="sheet-tools">
          <span className="sheet-tool-slot" ref={setSlot} />
          <button type="button" className="icon-btn tool-btn" onClick={onClose} aria-label="Close" title="Close">
            <HeadIcon d={CLOSE_ICON} />
          </button>
        </div>
      </div>
      <ToolSlot.Provider value={slot}>{open && children}</ToolSlot.Provider>
    </dialog>
  );
}

/**
 * Save (left) and Delete (middle) as icons in the sheet header; the × (right) closes.
 * The Save icon submits the form with id `formId`.
 */
export function FormActions({
  formId,
  saveDisabled,
  hideSave,
  onDelete,
  deleteLabel
}: {
  formId: string;
  saveDisabled?: boolean;
  hideSave?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const slot = useContext(ToolSlot);
  const icons = (
    <>
      {!hideSave && (
        <button type="submit" form={formId} className="icon-btn tool-btn tool-btn-go" disabled={saveDisabled} aria-label="Save" title="Save">
          <HeadIcon d={SAVE_ICON} />
        </button>
      )}
      {onDelete && (
        <button type="button" className="icon-btn tool-btn tool-btn-danger" onClick={onDelete} aria-label={deleteLabel ? `Delete ${deleteLabel}` : 'Delete'} title="Delete">
          <HeadIcon d={TRASH_ICON} />
        </button>
      )}
    </>
  );
  return slot ? createPortal(icons, slot) : <div className="sheet-actions">{icons}</div>;
}
