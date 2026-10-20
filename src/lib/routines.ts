import { supabase } from './supabase';

export type Kind = 'routine' | 'ritual';
export type Shift = 'days' | 'nights';

/** A step. The time is optional; untimed steps show as their own rows too. */
export interface RoutineItem {
  time: string | null; // "HH:MM", 24-hour, as written for Days
  label: string;
  /** Ritual steps only. step = tick it; meditation = plays its script; checkin = a journal check-in. */
  type?: 'step' | 'meditation' | 'checkin' | 'list';
  /** List: the choices (Chill time → Outdoor, Movie, Read) and the one picked last. */
  options?: string[];
  picked?: string;
  /** Tapping the step's name opens this (a site or an app link). */
  url?: string;
  /** Meditation: the words that play up the screen (kept as a fallback; the library has the live copy). */
  script?: string;
  /** Meditation: which one from the library (lib/meditations.ts). */
  meditationId?: string;
  /** Check-in: which of today's journal check-ins (1 = ✓ Check in #1). */
  checkin?: number;
  /** Routine steps only: the Non-Negotiable this step is (kept in sync, see nnsync.ts). */
  nonNegId?: string;
}

export interface Routine {
  id: string;
  name: string;
  kind: Kind;
  /** Offers Days and Nights; Nights moves every time by 12 hours. */
  flips: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  wake: string | null;
  bed: string | null;
  items: RoutineItem[];
  sort: number;
  /** Rituals: routine days ("YYYY-MM-DD") it leads the Rituals card. Column from 0025. */
  onDates?: string[];
}

const step = (time: string | null, label: string): RoutineItem => ({ time, label });

/** Starter set. MWD (On Site) is the ROUTINE tab of the Launch Sheet; HQ is a draft to edit. */
export function seedRoutines(): Routine[] {
  const id = () => crypto.randomUUID();
  return [
    {
      id: id(),
      name: 'MWD (On Site)',
      kind: 'routine',
      flips: true,
      shiftStart: '06:00',
      shiftEnd: '18:00',
      wake: '05:00',
      bed: '21:00',
      sort: 0,
      items: [
        step('05:00', 'Rise to Shine'),
        step('06:00', 'Start MWD'),
        step(null, 'H2O'),
        step(null, 'Ritual'),
        step('07:00', 'Coffee +'),
        step(null, 'Headspace ×3'),
        step(null, 'Power Up'),
        step(null, 'Settle In'),
        step('09:00', 'Check-in #1'),
        step(null, 'Breakfast'),
        step('09:30', 'Start (10 × 3) on the HH'),
        step(null, '1.5 × LAUNCH!'),
        step(null, 'Email'),
        step('12:00', 'Lunch'),
        step('13:00', 'Check-in #2'),
        step(null, '1.5 × LAUNCH!'),
        step(null, 'Email'),
        step(null, 'Instagram'),
        step(null, '1.5 × LAUNCH!'),
        step('17:30', 'End (10 × 3) on the HH'),
        step(null, 'End of shift preparation'),
        step('18:00', 'End MWD'),
        step(null, 'Take pills'),
        step(null, 'Dinner in'),
        step(null, 'Outdoor'),
        step(null, 'Read'),
        step(null, 'Leisure work'),
        step(null, 'Chill time'),
        step('20:00', 'Power Down'),
        step(null, 'Check-in #3'),
        step(null, 'H2O'),
        step('21:00', 'Bed')
      ]
    },
    {
      id: id(),
      name: 'HQ',
      kind: 'routine',
      flips: false,
      shiftStart: null,
      shiftEnd: null,
      wake: '08:00',
      bed: '23:00',
      sort: 1,
      items: [
        step('08:00', 'Wake Up'),
        step(null, 'Rise to Shine Ritual'),
        step(null, 'Power Up'),
        step(null, 'Water before coffee'),
        step('09:00', 'Check-in #1'),
        step('09:30', '1.5 × LAUNCH!'),
        step('13:00', 'Check-in #2'),
        step('18:00', 'Check-in #3'),
        step('19:30', 'Water + Pills'),
        step('22:00', 'Power Down'),
        step(null, 'Gratitude Ritual'),
        step('23:00', 'Bed')
      ]
    }
  ];
}

// ---------- Time helpers ----------

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h % 24) * 60 + (m || 0);
};

/** Nights moves a Days time by 12 hours (the Launch Sheet's "AM/PM" rows). */
export const shiftMinutes = (hhmm: string, shift: Shift, flips: boolean) =>
  (toMinutes(hhmm) + (flips && shift === 'nights' ? 720 : 0)) % 1440;

export function formatMinutes(min: number) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ap = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${m < 10 ? '0' : ''}${m} ${ap}`;
}

const fmt = (hhmm: string | null, shift: Shift, flips: boolean) =>
  hhmm ? formatMinutes(shiftMinutes(hhmm, shift, flips)) : null;

export interface Block {
  minutes: number | null;
  time: string | null;
  label: string;
  steps: string[];
}

/** Every step is its own row, with or without a time (Oct 16: grouping under the step above retired). */
export function toBlocks(r: Routine, shift: Shift): Block[] {
  return r.items
    .filter((it) => it.label.trim())
    .map((it) => {
      const minutes = it.time ? shiftMinutes(it.time, shift, r.flips) : null;
      return { minutes, time: minutes === null ? null : formatMinutes(minutes), label: it.label, steps: [] };
    });
}

/** Rituals move to 26 Days; the picker and the Launch Page only show routines. */
export const routinesOnly = (list: Routine[]) => list.filter((r) => r.kind !== 'ritual');

/**
 * The block happening now. The routine's day starts at its first timed step, and every
 * time is counted forward from there (so a Nights routine that runs past midnight works).
 * Oct 20 fix: a step whose time is earlier than the step above it (e.g. Breakfast 9:00 after
 * Power Up 9:25) used to push it and every step below it a full day ahead, so NOW froze.
 * Now each time is measured on its own, and NOW is the latest step that has started.
 */
export function nowBlockIndex(blocks: Block[], now: Date): number {
  const timed = blocks.map((b, i) => ({ i, m: b.minutes })).filter((x): x is { i: number; m: number } => x.m !== null);
  if (timed.length === 0) return -1;
  const start = timed[0].m;
  const nowOff = (now.getHours() * 60 + now.getMinutes() - start + 1440) % 1440;
  let idx = -1;
  let best = -1;
  for (const x of timed) {
    const off = (x.m - start + 1440) % 1440;
    if (off <= nowOff && off >= best) {
      best = off;
      idx = x.i;
    }
  }
  return idx;
}

export function routineLabel(r: Routine, shift: Shift) {
  return r.flips ? `${r.name} · ${shift === 'nights' ? 'Nights' : 'Days'}` : r.name;
}

export function shiftLine(r: Routine, shift: Shift) {
  const parts: string[] = [];
  const s = fmt(r.shiftStart, shift, r.flips);
  const e = fmt(r.shiftEnd, shift, r.flips);
  if (s && e) parts.push(`Shift ${s} – ${e}`);
  else parts.push(r.name);
  const w = fmt(r.wake, shift, r.flips);
  const b = fmt(r.bed, shift, r.flips);
  if (w) parts.push(`Wake ${w}`);
  if (b) parts.push(`Bed by ${b}`);
  return parts.join(' · ');
}

// ---------- Storage: Supabase when signed in, this browser otherwise ----------

const LOCAL_KEY = 'launchpage.routines.v1';

function readLocal(): Routine[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Routine[]) : null;
  } catch {
    return null;
  }
}

function writeLocal(list: Routine[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: this visit still works */
  }
}

type Row = {
  id: string;
  name: string;
  kind: Kind;
  flips: boolean;
  shift_start: string | null;
  shift_end: string | null;
  wake: string | null;
  bed: string | null;
  items: RoutineItem[];
  sort: number;
  on_dates?: string[] | null;
};

const toRow = (r: Routine): Row => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  flips: r.flips,
  shift_start: r.shiftStart,
  shift_end: r.shiftEnd,
  wake: r.wake,
  bed: r.bed,
  items: r.items,
  sort: r.sort,
  // Only sent when dates were set (needs 0025), so older setups keep saving cleanly.
  ...(r.onDates && r.onDates.length ? { on_dates: r.onDates } : r.onDates ? { on_dates: [] } : {})
});

const fromRow = (row: Row): Routine => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  flips: row.flips,
  shiftStart: row.shift_start,
  shiftEnd: row.shift_end,
  wake: row.wake,
  bed: row.bed,
  items: Array.isArray(row.items) ? row.items : [],
  sort: row.sort,
  ...(row.on_dates !== undefined ? { onDates: row.on_dates ?? [] } : {})
});

export interface LoadResult {
  routines: Routine[];
  /** Set when the cloud table is missing or unreachable; the app falls back to this browser. */
  problem: string | null;
}

export async function loadRoutines(userId: string | null): Promise<LoadResult> {
  if (supabase && userId) {
    const { data, error } = await supabase.from('routines').select('*').order('sort');
    if (!error && data) {
      if (data.length > 0) {
        const list = (data as Row[]).map(fromRow);
        writeLocal(list);
        return { routines: list, problem: null };
      }
      const seed = readLocal() ?? seedRoutines();
      const { error: insertError } = await supabase.from('routines').insert(seed.map(toRow));
      writeLocal(seed);
      return { routines: seed, problem: insertError ? insertError.message : null };
    }
    const fallback = readLocal() ?? seedRoutines();
    return {
      routines: fallback,
      problem: 'Routines are saving on this device only. Run supabase/migrations/0002_routines.sql in Supabase to sync them.'
    };
  }
  const local = readLocal();
  if (local) return { routines: local, problem: null };
  const seed = seedRoutines();
  writeLocal(seed);
  return { routines: seed, problem: null };
}

export async function saveRoutine(userId: string | null, r: Routine, all: Routine[]) {
  writeLocal(all);
  if (!supabase || !userId) return true;
  const { error } = await supabase.from('routines').upsert(toRow(r));
  return !error;
}

export async function deleteRoutine(userId: string | null, id: string, all: Routine[]) {
  writeLocal(all);
  if (!supabase || !userId) return true;
  const { error } = await supabase.from('routines').delete().eq('id', id);
  return !error;
}

// ---------- Which routine is active ----------

const ACTIVE_KEY = 'launchpage.active.v1';

export function readActiveLocal(): { id: string | null; shift: Shift } {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { id: null, shift: 'nights' };
}

export async function loadActive(userId: string | null): Promise<{ id: string | null; shift: Shift }> {
  const local = readActiveLocal();
  if (supabase && userId) {
    const { data, error } = await supabase
      .from('settings')
      .select('active_routine_id, active_shift')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data && (data as { active_routine_id: string | null }).active_routine_id) {
      const d = data as { active_routine_id: string | null; active_shift: Shift };
      return { id: d.active_routine_id, shift: d.active_shift };
    }
  }
  return local;
}

export async function saveActive(userId: string | null, id: string, shift: Shift) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, shift }));
  } catch {
    /* ignore */
  }
  if (!supabase || !userId) return;
  await supabase.from('settings').update({ active_routine_id: id, active_shift: shift }).eq('user_id', userId);
}
