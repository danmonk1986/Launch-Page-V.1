import { useLayoutEffect, useRef, useState } from 'react';

/**
 * V20-061 (Nov 11): a row of tabs that never stacks. When the row gets too narrow, the tabs that
 * don't fit fold into a teal ⌄ at the end of the row (the same as the page tabs in the header).
 */
export function FoldTabs<T extends string>({
  label,
  items,
  value,
  onPick
}: {
  label: string;
  items: { id: T; label: string; count?: number }[];
  value: T;
  onPick: (id: T) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(items.length);
  const [open, setOpen] = useState(false);
  const key = items.map((i) => `${i.label}${i.count ?? ''}`).join('|');

  useLayoutEffect(() => {
    const row = wrap.current;
    const r = ruler.current;
    if (!row || !r) return;
    const calc = () => {
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = Array.from(r.children).map((c) => (c as HTMLElement).offsetWidth + gap);
      const room = row.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0) - gap;
      if (total <= room) return setFit(widths.length);
      let used = 36 + gap; // room for the ⌄
      let n = 0;
      while (n < widths.length && used + widths[n] <= room) used += widths[n++];
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(row);
    return () => ro.disconnect();
  }, [key]);

  const shown = items.slice(0, fit);
  const folded = items.slice(fit);
  const foldedOn = folded.some((i) => i.id === value);
  const tab = (i: (typeof items)[number]) => (
    <>
      {i.label}
      {i.count !== undefined && <span className="timed-tab-count">{i.count}</span>}
    </>
  );
  return (
    <div className="timed-tabs fold-tabs" role="tablist" aria-label={label} ref={wrap}>
      <div className="fold-ruler" ref={ruler} aria-hidden="true">
        {items.map((i) => (
          <span key={i.id} className="timed-tab">
            {tab(i)}
          </span>
        ))}
      </div>
      {shown.map((i) => (
        <button key={i.id} type="button" role="tab" aria-selected={value === i.id} className="timed-tab" onClick={() => onPick(i.id)}>
          {tab(i)}
        </button>
      ))}
      {folded.length > 0 && (
        <div
          className="row-menu fold-more"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <button
            type="button"
            className={`timed-tab fold-more-btn${foldedOn ? ' is-active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`More: ${folded.map((i) => i.label).join(', ')}`}
            onClick={() => setOpen((o) => !o)}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {open && (
            <div className="row-menu-list fold-list" role="menu">
              {folded.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="menuitem"
                  aria-current={value === i.id ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false);
                    onPick(i.id);
                  }}
                >
                  {i.label}
                  {i.count !== undefined && ` · ${i.count}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
