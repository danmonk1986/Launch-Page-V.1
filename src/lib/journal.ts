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

/** "FRI · OCT 16" */
export function journalDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase().replace(',', ' ·');
}

export const isBlank = (j: JournalEntry) => !j.headline.trim() && !j.body.trim();
