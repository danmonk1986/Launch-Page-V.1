import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
    const { data, error } = await q.order('id').range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    const rows = (data ?? []) as R[];
    out.push(...rows);
    if (rows.length < PAGE) return { data: out, error: null };
  }
}
