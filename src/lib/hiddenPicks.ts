/**
 * Hidden picks (Oct 24): the ✕ beside a remembered description in a dropdown hides it from
 * that list. The logs, launches and budget lines that used it keep it.
 * Lists are named: "log:food", "launch:what", "launch:work block" (numbers ignored, so Work
 * Block #1, #2 and #3 share one list), "budget:project"…
 */
import { createContext } from 'react';
import { makeStore } from './store';

export interface HiddenPick {
  id: string;
  list: string;
  value: string;
  sort: number;
}

type Row = { id: string; list: string; value: string; sort: number };

export const hiddenPickStore = makeStore<HiddenPick, Row>({
  table: 'hidden_picks',
  localKey: 'launchpage.hiddenpicks.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0030_hidden_picks.sql',
  seed: () => [],
  toRow: (h) => ({ id: h.id, list: h.list, value: h.value, sort: h.sort }),
  fromRow: (r) => ({ id: r.id, list: r.list ?? '', value: r.value ?? '', sort: r.sort ?? 0 })
});

export const pickKey = (v: string) => v.trim().toLowerCase();

/** A launch category's list name: "Work Block #2" → "launch:work block". */
export const launchListFor = (cat: string) => `launch:${cat.toLowerCase().replace(/#\s*\d+/g, '').replace(/\s+/g, ' ').trim()}`;

export const HiddenPicksContext = createContext<{ hidden: HiddenPick[]; hide: (list: string, value: string) => void }>({
  hidden: [],
  hide: () => {}
});
