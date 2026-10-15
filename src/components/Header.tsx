import type { BrandSettings } from '../lib/settings';
import { Clock } from './Clock';

export function Header({ settings }: { settings: BrandSettings }) {
  return (
    <header className="masthead">
      <div className="brand">
        {settings.logoUrl ? (
          <img className="brand-logo-img" src={settings.logoUrl} alt={settings.logoText || 'Logo'} />
        ) : (
          <span className="brand-logo">{settings.logoText}</span>
        )}
        <h1 className="goal">{settings.goal}</h1>
        <p className="mantra">{settings.mantra}</p>
      </div>
      <Clock />
    </header>
  );
}
