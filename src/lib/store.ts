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

  return {
    async load(userId) {
      if (supabase && userId) {
        const { data, error } = await supabase.from(opts.table).select('*').order(opts.orderBy);
        if (!error && data) {
          if (data.length > 0) {
            const list = (data as R[]).map(opts.fromRow);
            writeLocal(list);
            return { items: list, problem: null };
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
      const { error } = await supabase.from(opts.table).upsert(opts.toRow(item));
      return !error;
    },

    async remove(userId, id, all) {
      writeLocal(all);
      if (!supabase || !userId) return true;
      const { error } = await supabase.from(opts.table).delete().eq('id', id);
      return !error;
    }
  };
}
