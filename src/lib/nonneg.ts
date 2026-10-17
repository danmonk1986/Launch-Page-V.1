/**
 * The old on-device Non-Negotiables template (Oct 16), fed by "Add non-negotiable" in the
 * routine editor before 26 Days existed. 26 Days moves anything in it into its own synced
 * list once, then clears it.
 */
const KEY = 'launchpage.nonnegs.v1';

export function readLegacyNonNegs(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as { label?: string }[]) : [];
    return list.map((n) => (n.label ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function clearLegacyNonNegs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
