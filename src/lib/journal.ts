import { makeStore } from './store';

/** One day in the Journal: a headline, the theme line under it, and an optional page. */
export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  headline: string;
  theme: string;
  body: string;
  sort: number;
}

type Row = { id: string; entry_date: string; headline: string; theme: string; body: string; sort: number };

export const journalStore = makeStore<JournalEntry, Row>({
  table: 'journal',
  localKey: 'launchpage.journal.v1',
  orderBy: 'entry_date',
  script: 'supabase/migrations/0011_journal.sql',
  seed: () => [],
  toRow: (j) => ({ id: j.id, entry_date: j.date, headline: j.headline, theme: j.theme, body: j.body, sort: j.sort }),
  fromRow: (r) => ({ id: r.id, date: r.entry_date, headline: r.headline, theme: r.theme, body: r.body, sort: r.sort })
});

export function newEntry(date: string, theme = ''): JournalEntry {
  return { id: crypto.randomUUID(), date, headline: '', theme, body: '', sort: 0 };
}

/** Newest first. */
export function byNewest(list: JournalEntry[]) {
  return [...list].sort((a, b) => (a.date === b.date ? b.sort - a.sort : b.date < a.date ? -1 : 1));
}

/** "10/16/26" */
export function shortDate(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y.slice(2)}`;
}

/** Days in a row with an entry, ending today (or yesterday, while today is still unwritten). */
export function streak(list: JournalEntry[], todayIso: string) {
  const days = new Set(list.filter((e) => !isBlank(e)).map((e) => e.date));
  const step = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let day = days.has(todayIso) ? todayIso : step(todayIso);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = step(day);
  }
  return n;
}

/** Reads a LaunchPage journal import file. Entries for days already written are left alone. */
export function buildJournalImport(json: unknown, existing: JournalEntry[]): JournalEntry[] {
  const data = json as { kind?: string; entries?: { date?: string; headline?: string; theme?: string; body?: string }[] };
  if (!data || data.kind !== 'journal' || !Array.isArray(data.entries)) throw new Error('That file isn’t a LaunchPage journal import.');
  const taken = new Set(existing.map((e) => e.date));
  return data.entries
    .filter((e) => typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !taken.has(e.date))
    .map((e) => ({ id: crypto.randomUUID(), date: e.date!, headline: (e.headline ?? '').trim(), theme: (e.theme ?? '').trim(), body: (e.body ?? '').trim(), sort: 0 }))
    .filter((e) => !isBlank(e));
}

/** "FRI · OCT 16" */
export function journalDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase().replace(',', ' ·');
}

export const isBlank = (j: JournalEntry) => !j.headline.trim() && !j.body.trim();
