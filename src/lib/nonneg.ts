/**
 * The 26 Days non-negotiables template. 26 Days (next module) reads and edits this list;
 * until then it lives on this device, fed by "+ Non-negotiable" in the routine editor.
 * New routines start with these as their baseline steps.
 */
export interface NonNeg {
  id: string;
  label: string;
}

const KEY = 'launchpage.nonnegs.v1';

export function readNonNegs(): NonNeg[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NonNeg[]) : [];
  } catch {
    return [];
  }
}

/** Adds a non-negotiable to the template; false if it's already there. */
export function addNonNeg(label: string): boolean {
  const clean = label.trim();
  if (!clean) return false;
  const list = readNonNegs();
  if (list.some((n) => n.label.toLowerCase() === clean.toLowerCase())) return false;
  list.push({ id: crypto.randomUUID(), label: clean });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  return true;
}
