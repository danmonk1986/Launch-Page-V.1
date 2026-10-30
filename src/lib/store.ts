import { selectAll, supabase } from './supabase';

/**
 * One list of records kept in a Supabase table when signed in, mirrored in this
 * browser so the app opens without a connection. If the table is missing (its
 * setup script not run yet), the list keeps working on this device only.
 */
export interface Store<T extends { id: string }> {
  load(userId: string | null): Promise<{ items: T[]; problem: string | null }>;
  /** true = saved; false = this device only (retries later); 'newer' = another device's newer copy won. */
  save(userId: string | null, item: T, all: T[]): Promise<boolean | 'newer'>;
  remove(userId: string | null, id: string, all: T[]): Promise<boolean>;
  /**
   * V20-009: called when a save found the record changed (or deleted) on another device since this
   * device last saw it. The newer copy wins and is handed here (null = deleted) to show instead.
   */
  onNewer(fn: (id: string, newer: T | null) => void): void;
  /** V20-011: sends changes still waiting on this device (connection back, app back in view). Returns how many went. */
  flush(userId: string | null): Promise<number>;
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
  // V20-009 · versions: the updated_at this device last saw for each record (the database stamps it
  // on every change). A save only goes through if the record is still at that version; otherwise
  // another device changed it since, and its newer copy wins instead of being overwritten.
  const verKey = `${opts.localKey}.ver`;
  const versions: Record<string, string> = (() => {
    try {
      return JSON.parse(localStorage.getItem(verKey) ?? '{}');
    } catch {
      return {};
    }
  })();
  const keepVersions = () => {
    try {
      localStorage.setItem(verKey, JSON.stringify(versions));
    } catch {
      /* ignore */
    }
  };
  const seen = (r: unknown) => {
    const x = r as { id?: string; updated_at?: string };
    if (x?.id && x.updated_at) versions[x.id] = x.updated_at;
  };
  let newer: (id: string, item: T | null) => void = () => {};
  // Saves of one record run one after another, so a quick second change never races the first.
  const lanes = new Map<string, Promise<unknown>>();
  const inLane = <X,>(id: string, job: () => Promise<X>): Promise<X> => {
    const run = (lanes.get(id) ?? Promise.resolve()).then(job, job);
    lanes.set(id, run.catch(() => undefined));
    return run;
  };

  /**
   * Upsert one record, every column (V20-008: no legacy fallback). Returns false when it didn't
   * reach Supabase, 'newer' when another device's newer copy won (V20-009).
   */
  const push = (item: T, opts2: { force?: boolean } = {}): Promise<'full' | 'newer' | false> =>
    inLane(item.id, async () => {
      if (!supabase) return 'full';
      const row = opts.toRow(item);
      const known = versions[item.id];
      if (known && !opts2.force) {
        const { data, error } = await supabase.from(opts.table).update(row).eq('id', item.id).eq('updated_at', known).select('*');
        if (error) return false;
        if (data && data.length) {
          seen(data[0]);
          keepVersions();
          return 'full';
        }
        // Not at the version this device saw: changed or deleted elsewhere. Theirs wins.
        const cur = await supabase.from(opts.table).select('*').eq('id', item.id).maybeSingle();
        if (cur.error) return false;
        if (cur.data) seen(cur.data);
        else delete versions[item.id];
        keepVersions();
        newer(item.id, cur.data ? opts.fromRow(cur.data as R) : null);
        return 'newer';
      }
      const { data, error } = await supabase.from(opts.table).upsert(row).select('*');
      if (error) return false;
      if (data && data[0]) seen(data[0]);
      keepVersions();
      return 'full';
    });

  return {
    async load(userId) {
      if (supabase && userId) {
        const { data, error } = await selectAll<R>(opts.table, opts.orderBy);
        if (!error && data) {
          // Retry anything that failed last time before trusting the Supabase copy.
          const pending = readPending();
          const local = readLocal() ?? [];
          for (const r of data) seen(r);
          keepVersions();
          let list = (data as R[]).map(opts.fromRow);
          let stuck = 0;
          for (const id of pending.upserts) {
            const item = local.find((x) => x.id === id);
            if (!item) {
              mark('upserts', id, false);
              continue;
            }
            // A change made offline on this device: it was made on purpose, so it goes in over the cloud copy.
            if (await push(item, { force: true })) mark('upserts', id, false);
            else stuck += 1;
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
            const problem = stuck ? `${stuck} change${stuck === 1 ? '' : 's'} saved on this device only (${opts.table}). They'll retry on the next load.` : null;
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
      mark('upserts', item.id, !how);
      return how === 'newer' ? 'newer' : !!how;
    },

    async remove(userId, id, all) {
      writeLocal(all);
      if (!supabase || !userId) return true;
      const { error } = await supabase.from(opts.table).delete().eq('id', id);
      mark('deletes', id, !!error);
      if (!error) {
        delete versions[id];
        keepVersions();
      }
      return !error;
    },

    onNewer(fn) {
      newer = fn;
    },

    async flush(userId) {
      if (!supabase || !userId) return 0;
      const pending = readPending();
      if (!pending.upserts.length && !pending.deletes.length) return 0;
      const local = readLocal() ?? [];
      let sent = 0;
      for (const id of pending.upserts) {
        const item = local.find((x) => x.id === id);
        if (!item) {
          mark('upserts', id, false);
          continue;
        }
        // Made on this device while offline, on purpose: it goes in over the cloud copy.
        if (await push(item, { force: true })) {
          mark('upserts', id, false);
          sent += 1;
        }
      }
      for (const id of pending.deletes) {
        const { error } = await supabase.from(opts.table).delete().eq('id', id);
        if (!error) {
          mark('deletes', id, false);
          delete versions[id];
          sent += 1;
        }
      }
      keepVersions();
      return sent;
    }
  };
}
