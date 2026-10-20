/**
 * Non-Negotiables are the baseline of every routine (Oct 20).
 * Every active Non-Negotiable appears as a step in every routine (not rituals):
 * - a step already there under the same or a close name is linked, not duplicated
 *   ("Check-in #1" links to "Check-in #1 - Rise to Shine");
 * - a missing one is added in its section (Morning near the top, Midday mid-list, Evening
 *   before the end; Wake Up first and Bed last), with the Non-Negotiable's time if it has one;
 * - a linked step takes the Non-Negotiable's name; renaming one renames its steps; removing
 *   one removes its linked steps.
 * Times stay the routine's own: change them in Edit Routine.
 * Pure: returns only the routines that changed. Running it twice changes nothing.
 */
import type { NonNeg } from './days26';
import type { Routine, RoutineItem } from './routines';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const head = (s: string) => s.split(/\s[-–—]\s/)[0];

export function sameStep(a: string, b: string) {
  const fa = norm(a);
  const fb = norm(b);
  const ha = norm(head(a));
  const hb = norm(head(b));
  if (!fa || !fb) return false;
  return fa === fb || ha === fb || fa === hb || (ha.length > 0 && ha === hb);
}

const SECTION_START: Record<NonNeg['section'], number> = { morning: 0, midday: 11 * 60, evening: 17 * 60 };
const mins = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

const RANK: Record<NonNeg['section'], number> = { morning: 0, midday: 1, evening: 2 };

function insertAt(items: RoutineItem[], n: NonNeg, list: NonNeg[]): number {
  if (n.timeFrom === 'wake') return 0;
  if (n.timeFrom === 'bed') return items.length;
  const of = (it: RoutineItem) => (it.nonNegId ? list.find((x) => x.id === it.nonNegId) : undefined);
  const bedAt = items.findIndex((it) => of(it)?.timeFrom === 'bed');
  const limit = bedAt >= 0 ? bedAt : items.length;
  // After the last linked step from this section or an earlier one (keeps the list's order).
  let last = -1;
  items.forEach((it, i) => {
    const x = of(it);
    if (x && x.timeFrom !== 'bed' && RANK[x.section] <= RANK[n.section]) last = i;
  });
  if (last >= 0) return Math.min(last + 1, limit);
  // Nothing linked yet: before the first timed step at or after the section's start (Days times).
  const start = SECTION_START[n.section];
  const firstAfter = items.findIndex((it, i) => i > 0 && (mins(it.time) ?? -1) >= start);
  if (firstAfter > 0) return Math.min(firstAfter, limit);
  return n.section === 'morning' ? Math.min(1, limit) : limit;
}

export function syncNonNegs(routines: Routine[], nonnegs: NonNeg[]): Routine[] {
  const active = nonnegs.filter((n) => !n.archived && n.label.trim()).sort((a, b) => a.sort - b.sort);
  const activeIds = new Set(active.map((n) => n.id));
  const changed: Routine[] = [];
  for (const r of routines) {
    if (r.kind === 'ritual') continue;
    let dirty = false;
    // Removed Non-Negotiables take their linked steps with them.
    let items = r.items.filter((it) => {
      const gone = !!it.nonNegId && !activeIds.has(it.nonNegId);
      if (gone) dirty = true;
      return !gone;
    });
    for (const n of active) {
      const linked = items.findIndex((it) => it.nonNegId === n.id);
      if (linked >= 0) {
        if (items[linked].label !== n.label.trim()) {
          items = items.map((it, i) => (i === linked ? { ...it, label: n.label.trim() } : it));
          dirty = true;
        }
        continue;
      }
      const match = items.findIndex((it) => !it.nonNegId && sameStep(it.label, n.label));
      if (match >= 0) {
        items = items.map((it, i) => (i === match ? { ...it, label: n.label.trim(), nonNegId: n.id } : it));
        dirty = true;
        continue;
      }
      const time = n.timeFrom === 'wake' ? r.wake : n.timeFrom === 'bed' ? r.bed : n.time;
      const at = insertAt(items, n, active);
      items = [...items.slice(0, at), { time: time ?? null, label: n.label.trim(), nonNegId: n.id }, ...items.slice(at)];
      dirty = true;
    }
    if (dirty) changed.push({ ...r, items });
  }
  return changed;
}
