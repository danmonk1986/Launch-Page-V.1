/**
 * V20-210 (Dan, Nov 14): What lives with the projects.
 * - One shared list (Settings `whats`; the ten defaults until it's changed). Each item has a default time.
 * - Each project picks which ones it uses (projects.whats; null = all of them). A project under an area
 *   that hasn't picked its own uses its area's.
 * - The launch form's What list shows only the picked project's Whats.
 */
export type WhatItem = { name: string; minutes: number };

export const WHAT_DEFAULTS: WhatItem[] = [
  { name: 'WORK BLOCK', minutes: 90 },
  { name: 'EXPANSION WORK', minutes: 60 },
  { name: 'LEISURE WORK', minutes: 60 },
  { name: 'MEETING', minutes: 60 },
  { name: 'SETUP', minutes: 30 },
  { name: 'SHOP WORK', minutes: 90 },
  { name: 'BANKING', minutes: 15 },
  { name: 'DIGITAL ORGANIZATION', minutes: 45 },
  { name: 'PERSONAL', minutes: 30 },
  { name: 'TRAINING', minutes: 60 }
];

let current: WhatItem[] = WHAT_DEFAULTS;
/** App sets the user's list on every render (from Settings); everything else reads it. */
export const setWhatList = (list?: WhatItem[] | null) => {
  current = list && list.length ? list : WHAT_DEFAULTS;
};
export const whatList = () => current;
export const cleanWhat = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

type P = { id: string; parentId: string | null; whats?: string[] | null };
/** The names a project uses, in the shared list's order. */
export function projectWhats(projectId: string | null | undefined, projects: P[]): string[] {
  const all = current.map((w) => w.name);
  const p = projectId ? projects.find((x) => x.id === projectId) : null;
  const own = p?.whats ?? (p?.parentId ? projects.find((x) => x.id === p.parentId)?.whats : null);
  return own ? all.filter((n) => own.includes(n)) : all;
}

/** A task's or a launch's What: its category matched to the list (Work Block #2 → WORK BLOCK, bills → BANKING). */
export function whatOfName(cat: string): string | null {
  const c = cleanWhat(cat);
  if (!c) return null;
  const exact = current.find((w) => w.name === c);
  if (exact) return exact.name;
  if (/^WORK BLOCK\b/.test(c)) return 'WORK BLOCK';
  if (/^(PLAN EXP|IMPO|BILL PMT)$/.test(c) || /\bBILL$/.test(c)) return current.some((w) => w.name === 'BANKING') ? 'BANKING' : null;
  return null;
}
