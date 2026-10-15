import type { BrandSettings } from './settings';

/** Step 1.9: everything you own, as one file. Grows as modules land. */
export function downloadExport(settings: BrandSettings) {
  const payload = {
    app: 'LaunchPage',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `launchpage-export-${payload.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
