import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** V20-434: the address as the page opened (read before the client below handles and clears an email link's error). */
export const OPENED_WITH = typeof window === 'undefined' ? '' : window.location.hash.slice(1) || window.location.search.slice(1);

/** Null until Supabase keys are set; the app then runs on this device only. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** Supabase returns at most this many rows per request (the project's default). */
const PAGE = 1000;

/**
 * Every row of a table (V20-007): read in pages of 1,000, so a list never silently stops at the
 * request limit (26 Days logs grow ~20 a day). Ordered by `orderBy` then id, so pages don't overlap.
 */
export async function selectAll<R>(table: string, orderBy?: string): Promise<{ data: R[] | null; error: { message: string } | null }> {
  if (!supabase) return { data: [], error: null };
  const out: R[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    if (orderBy && orderBy !== 'id') q = q.order(orderBy);
    let { data, error } = await q.order('id').range(from, from + PAGE - 1);
    // V20-392 (Dan, Nov 19): a phone waking up or switching networks can drop a request ("Load failed"). Try again
    // twice (after 0.8 s, then 2 s) before calling it a problem.
    for (const wait of [800, 2000]) {
      if (!error || !isNetworkError(error)) break;
      await new Promise((r) => setTimeout(r, wait));
      let again = supabase.from(table).select('*');
      if (orderBy && orderBy !== 'id') again = again.order(orderBy);
      ({ data, error } = await again.order('id').range(from, from + PAGE - 1));
    }
    if (error) return { data: null, error };
    const rows = (data ?? []) as R[];
    out.push(...rows);
    if (rows.length < PAGE) return { data: out, error: null };
  }
}

/**
 * V20-113: is this the account's current password? Checked on a throwaway client that keeps nothing,
 * so this device's own sign-in isn't touched.
 */
export async function checkPassword(email: string, password: string): Promise<boolean> {
  if (!url || !anonKey) return false;
  const probe = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'lp-password-check' } });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (!error) await probe.auth.signOut({ scope: 'local' });
  return !error;
}


/** V20-392: the request never reached the server (offline, a phone waking up), as opposed to a database error. */
export function isNetworkError(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code && /^(PGRST|[0-9A-Z]{5}$)/.test(e.code)) return false;
  return /fetch|load failed|network|timed? ?out|abort/i.test(e.message ?? '') || !e.code;
}

/** V20-392: the table itself is missing (its setup script not run). */
export function isMissingTable(e: { message?: string; code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''));
}
