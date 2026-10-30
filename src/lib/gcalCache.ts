import { selectAll, supabase } from './supabase';
import type { CalEvent } from './events';

/**
 * Google Calendar events kept in LaunchPage (Supabase + this browser), so the week shows
 * them straight away on load. Google stays the source of truth: each sync replaces what's
 * kept for the dates it covers. Needs supabase/migrations/0014_google_events.sql to sync
 * across devices; until then the copy lives on this device.
 */
const LOCAL_KEY = 'launchpage.gcal.cache.v1';
const META_KEY = 'launchpage.gcal.synced.v1';

type Meta = NonNullable<CalEvent['google']>;
type Row = {
  id: string;
  google_id: string;
  calendar_id: string;
  title: string;
  start_date: string;
  end_date: string;
  meta: Omit<Meta, 'id' | 'calendarId'>;
};

function readLocal(): CalEvent[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as CalEvent[];
  } catch {
    return [];
  }
}
function writeLocal(list: CalEvent[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* storage full: still shown for this visit */
  }
}

/** When the last sync ran (shown on the sync button). */
export function lastSynced(): Date | null {
  try {
    const v = localStorage.getItem(META_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}
function markSynced() {
  try {
    localStorage.setItem(META_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/** A stable uuid for one Google event, so a re-sync updates the same row. */
async function rowId(e: CalEvent) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${e.google!.calendarId}|${e.google!.id}`)));
  const h = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function toRow(e: CalEvent): Promise<Row> {
  const { id, calendarId, ...meta } = e.google!;
  return { id: await rowId(e), google_id: id, calendar_id: calendarId, title: e.title, start_date: e.startDate, end_date: e.endDate, meta };
}
const fromRow = (r: Row): CalEvent => ({
  id: `g:${r.google_id}`,
  title: r.title,
  startDate: r.start_date,
  endDate: r.end_date,
  color: 'blue',
  sort: 0,
  google: { id: r.google_id, calendarId: r.calendar_id, ...r.meta }
});

const overlaps = (e: CalEvent, from: string, to: string) => e.endDate >= from && e.startDate <= to;

/** What's kept: Supabase when it's set up, else this browser. */
export async function loadCached(userId: string | null): Promise<CalEvent[]> {
  if (supabase && userId) {
    const { data, error } = await selectAll<Row>('gcal_events');
    if (!error && data) {
      const list = (data as Row[]).map(fromRow);
      writeLocal(list);
      return list;
    }
  }
  return readLocal();
}

/** Replace what's kept for [from, to] with a fresh read from Google. Returns the full kept list. */
export async function syncRange(userId: string | null, kept: CalEvent[], from: string, to: string, fresh: CalEvent[]): Promise<CalEvent[]> {
  const next = [...kept.filter((e) => !overlaps(e, from, to)), ...fresh];
  writeLocal(next);
  markSynced();
  if (supabase && userId) {
    const rows = await Promise.all(fresh.map(toRow));
    if (rows.length) await supabase.from('gcal_events').upsert(rows, { onConflict: 'id' });
    // Drop kept events in this range that Google no longer has (deleted or moved).
    const keep = new Set(rows.map((r) => r.id));
    const { data } = await supabase.from('gcal_events').select('id').lte('start_date', to).gte('end_date', from);
    const gone = ((data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !keep.has(id));
    if (gone.length) await supabase.from('gcal_events').delete().in('id', gone);
  }
  return next;
}

/** One event added or changed from LaunchPage. */
export async function putCached(userId: string | null, kept: CalEvent[], e: CalEvent): Promise<CalEvent[]> {
  const next = [...kept.filter((x) => x.id !== e.id), e];
  writeLocal(next);
  if (supabase && userId) await supabase.from('gcal_events').upsert(await toRow(e), { onConflict: 'id' });
  return next;
}

/** One event deleted from LaunchPage. */
export async function dropCached(userId: string | null, kept: CalEvent[], e: CalEvent): Promise<CalEvent[]> {
  const next = kept.filter((x) => x.id !== e.id);
  writeLocal(next);
  if (supabase && userId) await supabase.from('gcal_events').delete().eq('id', await rowId(e));
  return next;
}

/** Disconnecting Google clears what was kept. */
export async function clearCached(userId: string | null) {
  writeLocal([]);
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
  if (supabase && userId) await supabase.from('gcal_events').delete().not('id', 'is', null);
}
