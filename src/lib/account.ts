/**
 * Whose data is on this device (Oct 30, V20-006).
 *
 * Every list keeps a copy in this browser so the app opens offline, and an empty account
 * uploads that copy on its first load. Without an owner check, signing a second account in on
 * the same browser would copy the first account's tasks, budget and logs into it. So the
 * browser remembers which account its copy belongs to, a different account starts clean, and
 * Sign out clears the copy.
 */
const OWNER_KEY = 'launchpage.owner.v1';

/** Device preferences (views, scroll mode, cached exchange rates): not anyone's data, kept. */
const DEVICE_KEYS = new Set([
  OWNER_KEY,
  'launchpage.budget.groupBy',
  'launchpage.budget.view',
  'launchpage.records.view',
  'launchpage.rockets.open',
  'launchpage.scroll.v1',
  'launchpage.tasks.view'
]);
const isDeviceKey = (k: string) => DEVICE_KEYS.has(k) || k.startsWith('launchpage.rate.');

function keys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith('launchpage.'));
  } catch {
    return [];
  }
}

/** Removes every account's copy from this browser (device preferences stay). */
export function wipeLocalData() {
  for (const k of keys()) {
    if (isDeviceKey(k)) continue;
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Changes made on this device that haven't reached Supabase yet. */
export function unsyncedCount(): number {
  let n = 0;
  for (const k of keys().filter((x) => x.endsWith('.pending'))) {
    try {
      const p = JSON.parse(localStorage.getItem(k) ?? '{}') as { upserts?: string[]; deletes?: string[] };
      n += (p.upserts?.length ?? 0) + (p.deletes?.length ?? 0);
    } catch {
      /* ignore */
    }
  }
  return n;
}

/**
 * Called as soon as an account is signed in, before anything loads.
 * - same: this browser's copy is this account's.
 * - adopted: a browser from before this check (no owner yet): its copy is taken as this account's.
 * - wiped: the copy belonged to another account and was cleared; the app reloads clean.
 */
export function claimDevice(userId: string): 'same' | 'adopted' | 'wiped' {
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER_KEY);
  } catch {
    return 'same';
  }
  if (owner === userId) return 'same';
  if (owner) wipeLocalData();
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* ignore */
  }
  return owner ? 'wiped' : 'adopted';
}

/** Sign out clears this browser's copy, so the next account can't pick it up. */
export function releaseDevice() {
  wipeLocalData();
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignore */
  }
}
