import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BrandSettings } from '../lib/settings';

/** journal is opened from the Journal panel, not the menu. */
export type PageId = 'launch' | 'tasks' | 'days26' | 'budget' | 'invoices' | 'journal';

const PAGES: { id: PageId; label: string }[] = [
  { id: 'launch', label: 'Launch Page' },
  { id: 'days26', label: '26 Days' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'budget', label: 'Budget' },
  { id: 'invoices', label: 'Invoices' }
];

type Props = {
  settings: BrandSettings;
  page: PageId;
  onPage: (p: PageId) => void;
  /** Top right: the routine picker with the date and time under it. */
  right?: ReactNode;
};

export function Header({ settings, page, onPage, right }: Props) {
  return (
    <header className="topbar">
      <img
        className="topbar-logo"
        src={settings.logoUrl || '/launchpage-logo.png'}
        alt={settings.logoUrl ? settings.logoText || 'Logo' : 'LaunchPage'}
      />
      <div className="topbar-words">
        <p className="motto">{settings.goal}</p>
        <p className="mantra">{settings.mantra}</p>
      </div>
      {right && <div className="topbar-right">{right}</div>}
      <TabBar page={page} onPage={onPage} />
    </header>
  );
}

/**
 * Page tabs. When the header gets too narrow, the tabs that don't fit fold into a
 * teal ⌄ menu at the end of the row instead of stacking.
 */
function TabBar({ page, onPage }: { page: PageId; onPage: (p: PageId) => void }) {
  const wrap = useRef<HTMLElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(PAGES.length);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const nav = wrap.current;
    const ruler = measure.current;
    if (!nav || !ruler) return;
    const calc = () => {
      const widths = Array.from(ruler.children).map((c) => (c as HTMLElement).offsetWidth + 4);
      const room = nav.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= room) return setFit(PAGES.length);
      let used = 52; // room for the ⌄ button
      let n = 0;
      while (n < widths.length && used + widths[n] <= room) used += widths[n++];
      setFit(Math.max(1, n));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  const shown = PAGES.slice(0, fit);
  const folded = PAGES.slice(fit);
  const foldedActive = folded.some((p) => p.id === page);
  return (
    <nav className="tabs" aria-label="Pages" ref={wrap}>
      <div className="tabs-ruler" ref={measure} aria-hidden="true">
        {PAGES.map((p) => (
          <span key={p.id} className="tab">
            {p.label}
          </span>
        ))}
      </div>
      {shown.map((p) => (
        <button key={p.id} type="button" className="tab" aria-current={page === p.id ? 'page' : undefined} onClick={() => onPage(p.id)}>
          {p.label}
        </button>
      ))}
      {folded.length > 0 && (
        <div
          className="row-menu tabs-more"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <button
            type="button"
            className={`tab tabs-more-btn${foldedActive ? ' is-active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="More pages"
            onClick={() => setOpen((o) => !o)}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {open && (
            <div className="row-menu-list tabs-more-list" role="menu">
              {folded.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  aria-current={page === p.id ? 'page' : undefined}
                  onClick={() => {
                    setOpen(false);
                    onPage(p.id);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
