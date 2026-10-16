import type { ReactNode } from 'react';
import type { BrandSettings } from '../lib/settings';

export type PageId = 'launch' | 'tasks' | 'days26' | 'summary' | 'planner';

const PAGES: { id: PageId; label: string }[] = [
  { id: 'launch', label: 'Launch Page' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'days26', label: '26 Days' },
  { id: 'summary', label: 'Summary' },
  { id: 'planner', label: 'Planner' }
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
