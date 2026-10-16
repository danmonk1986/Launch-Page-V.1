import { supabase } from './supabase';

/**
 * One list of records kept in a Supabase table when signed in, mirrored in this
 * browser so the app opens without a connection. If the table is missing (its
 * setup script not run yet), the list keeps working on this device only.
 */
export interface Store<T extends { id: string }> {
  load(userId: string | null): Promise<{ items: T[]; problem: string | null }>;
  save(userId: string | null, item: T, all: T[]): Promise<boolean>;
  remove(userId: string | null, id: string, all: T[]): Promise<boolean>;
}

export function makeStore<T extends { id: string }, R extends { id: string }>(opts: {
  table: string;
  localKey: string;
  orderBy: string;
  toRow: (t: T) => R;
  fromRow: (r: R) => T;
  seed: () => T[];
  script: string;
  /**
   * The row without columns added by later setup scripts. If a save fails because a
   * script has not been run yet, the record still saves in this shape.
   */
  legacyRow?: (r: R) => Partial<R>;
  /** The newest setup script, named in the message when only the legacy shape saved. */
  latestScript?: string;
}): Store<T> {
  const readLocal = (): T[] | null => {
    try {
      const raw = localStorage.getItem(opts.localKey);
      return raw ? (JSON.parse(raw) as T[]) : null;
    } catch {
      return null;
    }
  };
  const writeLocal = (list: T[]) => {
    try {
      localStorage.setItem(opts.localKey, JSON.stringify(list));
    } catch {
      /* storage unavailable: this visit still works */
    }
  };

  // Saves and deletes that did not reach Supabase. Retried on the next load, so a
  // failed save is never wiped out by the copy in Supabase.
  const pendingKey = `${opts.localKey}.pending`;
  type Pending = { upserts: string[]; deletes: string[] };
  const readPending = (): Pending => {
    try {
      const raw = localStorage.getItem(pendingKey);
      if (raw) return { upserts: [], deletes: [], ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return { upserts: [], deletes: [] };
  };
  const writePending = (p: Pending) => {
    try {
      if (!p.upserts.length && !p.deletes.length) localStorage.removeItem(pendingKey);
      else localStorage.setItem(pendingKey, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };
  const mark = (kind: keyof Pending, id: string, on: boolean) => {
    const p = readPending();
    const other: keyof Pending = kind === 'upserts' ? 'deletes' : 'upserts';
    p[kind] = p[kind].filter((x) => x !== id);
    p[other] = p[other].filter((x) => x !== id);
    if (on) p[kind].push(id);
    writePending(p);
  };
  let legacyOnly = false;

  /** Upsert one record; falls back to the legacy shape when a newer column is missing. */
  const push = async (item: T): Promise<'full' | 'legacy' | false> => {
    if (!supabase) return 'full';
    const row = opts.toRow(item);
    const { error } = await supabase.from(opts.table).upsert(row);
    if (!error) return 'full';
    if (opts.legacyRow) {
      const retry = await supabase.from(opts.table).upsert(opts.legacyRow(row));
      if (!retry.error) {
        legacyOnly = true;
        return 'legacy';
      }
    }
    return false;
  };

  return {
    async load(userId) {
      if (supabase && userId) {
        const { data, error } = await supabase.from(opts.table).select('*').order(opts.orderBy);
        if (!error && data) {
          // Retry anything that failed last time before trusting the Supabase copy.
          const pending = readPending();
          const local = readLocal() ?? [];
          let list = (data as R[]).map(opts.fromRow);
          let stuck = 0;
          for (const id of pending.upserts) {
            const item = local.find((x) => x.id === id);
            if (!item) {
              mark('upserts', id, false);
              continue;
            }
            const how = await push(item);
            // A legacy save stays pending, so this device's full version keeps winning.
            if (how === 'full') mark('upserts', id, false);
            else if (!how) stuck += 1;
            list = list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? item : x)) : [...list, item];
          }
          for (const id of pending.deletes) {
            const { error: delError } = await supabase.from(opts.table).delete().eq('id', id);
            if (!delError) mark('deletes', id, false);
            else stuck += 1;
            list = list.filter((x) => x.id !== id);
          }
          if (list.length > 0) {
            writeLocal(list);
            const problem = stuck
              ? `${stuck} change${stuck === 1 ? '' : 's'} saved on this device only. Run ${opts.latestScript ?? opts.script} in Supabase, then reload.`
              : legacyOnly
                ? `Some settings saved on this device only. Run ${opts.latestScript ?? opts.script} in Supabase.`
                : null;
            return { items: list, problem };
          }
          const seed = readLocal() ?? opts.seed();
          if (seed.length) {
            const { error: insertError } = await supabase.from(opts.table).insert(seed.map(opts.toRow));
            writeLocal(seed);
            return { items: seed, problem: insertError ? insertError.message : null };
          }
          return { items: [], problem: null };
        }
        return {
          items: readLocal() ?? opts.seed(),
          problem: `Saving on this device only. Run ${opts.script} in Supabase to sync.`
        };
      }
      const local = readLocal();
      if (local) return { items: local, problem: null };
      const seed = opts.seed();
      writeLocal(seed);
      return { items: seed, problem: null };
    },

    async save(userId, item, all) {
      writeLocal(all);
      if (!supabase || !userId) return true;
      const how = await push(item);
      mark('upserts', item.id, how !== 'full');
      return how !== false;
    },

    async remove(userId, id, all) {
      writeLocal(all);
      if (!supabase || !userId) return true;
      const { error } = await supabase.from(opts.table).delete().eq('id', id);
      mark('deletes', id, !!error);
      return !error;
    }
  };
}
