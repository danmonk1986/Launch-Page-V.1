import type { BrandSettings } from '../lib/settings';

export type PageId = 'launch' | 'days26' | 'summary' | 'planner';

const PAGES: { id: PageId; label: string }[] = [
  { id: 'launch', label: 'Launch Page' },
  { id: 'days26', label: '26 Days' },
  { id: 'summary', label: 'Summary' },
  { id: 'planner', label: 'Planner' }
];

type Props = {
  settings: BrandSettings;
  page: PageId;
  onPage: (p: PageId) => void;
  /** Active routine name; shown once routines arrive (L2). */
  routineName?: string;
};

export function Header({ settings, page, onPage, routineName }: Props) {
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
      {routineName && <span className="mode-chip">{routineName}</span>}
      <nav className="tabs" aria-label="Pages">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="tab"
            aria-current={page === p.id ? 'page' : undefined}
            onClick={() => onPage(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
