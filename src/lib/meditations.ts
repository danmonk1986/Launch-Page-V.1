/**
 * The meditation library (Oct 20): write a meditation once, pick it in any ritual's meditation
 * step, and an edit (in Edit ritual or under the player) changes it everywhere it's used.
 * Older steps that kept their own script move into the library on load.
 */
import { createContext } from 'react';
import { makeStore } from './store';

export interface Meditation {
  id: string;
  title: string;
  script: string;
  sort: number;
}

type Row = { id: string; title: string; script: string; sort: number };

export const meditationStore = makeStore<Meditation, Row>({
  table: 'meditations',
  localKey: 'launchpage.meditations.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0027_meditations.sql',
  seed: () => [],
  toRow: (m) => ({ id: m.id, title: m.title, script: m.script, sort: m.sort }),
  fromRow: (r) => ({ id: r.id, title: r.title ?? '', script: r.script ?? '', sort: r.sort ?? 0 })
});

/** The library, handed to every ritual (runner and editor) without threading it through pages. */
export const MeditationsContext = createContext<{ list: Meditation[]; save: (m: Meditation) => Promise<void>; remove: (id: string) => Promise<void> }>({
  list: [],
  save: async () => {},
  remove: async () => {}
});
