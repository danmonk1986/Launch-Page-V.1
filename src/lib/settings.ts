import { supabase } from './supabase';

/** In order: three dark, then three light. */
export const BACKGROUNDS = ['synthwave', 'night', 'navy', 'damascus', 'snow', 'white'] as const;
export type Background = (typeof BACKGROUNDS)[number];
export const LIGHT_BACKGROUNDS: readonly Background[] = ['damascus', 'snow', 'white'];
/** The backgrounds Supabase accepted before 0012_backgrounds.sql. */
const LEGACY_BACKGROUNDS = ['synthwave', 'night', 'plain'];
const BG_LOCAL_KEY = 'launchpage.settings.bgLocal';

/** Plain was retired for Navy (Oct 16); anything unknown falls back to Synthwave. */
function normalizeBackground(b: string): Background {
  if (b === 'plain') return 'navy';
  return (BACKGROUNDS as readonly string[]).includes(b) ? (b as Background) : 'synthwave';
}

export interface BrandSettings {
  displayName: string;
  logoText: string;
  logoUrl: string | null;
  goal: string;
  mantra: string;
  background: Background;
  accentPurple: string;
  accentTeal: string;
  /** Launcher colours 3 and 4. Purple and Teal are 1 and 2 and also colour the whole app. */
  accentGreen: string;
  accentPink: string;
  /** Day mode (the light backgrounds): its own four colours. The four above are night mode. */
  dayPurple: string;
  dayTeal: string;
  dayGreen: string;
  dayPink: string;
}

/** First user's brand. Every field is editable in Settings. */
export const DEFAULT_SETTINGS: BrandSettings = {
  displayName: 'Dan',
  logoText: 'Dan Monk',
  logoUrl: null,
  goal: "You can do anything. You just can't do everything.",
  mantra: 'search. create. evolve.',
  background: 'synthwave',
  accentPurple: '#8869cb',
  accentTeal: '#06f9c2',
  accentGreen: '#98ee92',
  accentPink: '#ff6ad5',
  // Day mode: the original, softer purple and teal from the brand palette, with a matching green and pink.
  dayPurple: '#8169af',
  dayTeal: '#76caba',
  dayGreen: '#8fbf7f',
  dayPink: '#c47aa8'
};

/** Oct 15: the neon pair from the logo became the master palette. Move the old defaults over. */
function upgradePalette(s: BrandSettings): BrandSettings {
  if (s.accentPurple.toLowerCase() === '#8169af' && s.accentTeal.toLowerCase() === '#76caba') {
    return { ...s, accentPurple: '#8869cb', accentTeal: '#06f9c2' };
  }
  return s;
}

const LOCAL_KEY = 'launchpage.settings.v1';

function readLocal(): BrandSettings {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = upgradePalette({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    return { ...s, background: normalizeBackground(s.background) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeLocal(s: BrandSettings) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch {
    /* private mode or storage full: settings still apply for this visit */
  }
}

type Row = {
  display_name: string;
  logo_text: string;
  logo_url: string | null;
  goal: string;
  mantra: string;
  background: string;
  accent_purple: string;
  accent_teal: string;
  accent_green?: string;
  accent_pink?: string;
  day_purple?: string;
  day_teal?: string;
  day_green?: string;
  day_pink?: string;
};

function hasLocalBg() {
  try {
    return localStorage.getItem(BG_LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}
function setLocalBg(on: boolean) {
  try {
    if (on) localStorage.setItem(BG_LOCAL_KEY, '1');
    else localStorage.removeItem(BG_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

const toRow = (s: BrandSettings): Row => ({
  display_name: s.displayName,
  logo_text: s.logoText,
  logo_url: s.logoUrl,
  goal: s.goal,
  mantra: s.mantra,
  background: s.background,
  accent_purple: s.accentPurple,
  accent_teal: s.accentTeal,
  accent_green: s.accentGreen,
  accent_pink: s.accentPink,
  day_purple: s.dayPurple,
  day_teal: s.dayTeal,
  day_green: s.dayGreen,
  day_pink: s.dayPink
});

const fromRow = (r: Row): BrandSettings => ({
  displayName: r.display_name,
  logoText: r.logo_text,
  logoUrl: r.logo_url,
  goal: r.goal,
  mantra: r.mantra,
  // Until 0012 is run, a newer background lives on this device only.
  background: hasLocalBg() ? readLocal().background : normalizeBackground(r.background),
  accentPurple: r.accent_purple,
  accentTeal: r.accent_teal,
  // Before 0007 is run these columns are missing: keep this device's choice.
  accentGreen: r.accent_green ?? readLocal().accentGreen,
  accentPink: r.accent_pink ?? readLocal().accentPink,
  // Before 0021 is run the day colours live on this device.
  dayPurple: r.day_purple ?? readLocal().dayPurple,
  dayTeal: r.day_teal ?? readLocal().dayTeal,
  dayGreen: r.day_green ?? readLocal().dayGreen,
  dayPink: r.day_pink ?? readLocal().dayPink
});

/** Cloud copy wins when signed in; the local copy is the offline fallback. */
export async function loadSettings(userId: string | null): Promise<BrandSettings> {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      const s = upgradePalette(fromRow(data as Row));
      writeLocal(s);
      return s;
    }
    if (!error && !data) {
      const seed = readLocal();
      await supabase.from('settings').insert({ user_id: userId, ...toRow(seed) });
      return seed;
    }
  }
  return readLocal();
}

export async function saveSettings(
  userId: string | null,
  s: BrandSettings
): Promise<{ synced: boolean }> {
  writeLocal(s);
  if (!supabase || !userId) return { synced: false };
  const row = toRow(s);
  const { error } = await supabase.from('settings').upsert({ user_id: userId, ...row });
  if (!error) {
    setLocalBg(false);
    return { synced: true };
  }
  // 0007, 0012 or 0021 not run yet: save everything else; what's new stays on this device.
  const noDay = { ...row };
  delete noDay.day_purple;
  delete noDay.day_teal;
  delete noDay.day_green;
  delete noDay.day_pink;
  if (!(await supabase.from('settings').upsert({ user_id: userId, ...noDay })).error) {
    setLocalBg(false);
    return { synced: false };
  }
  delete row.day_purple;
  delete row.day_teal;
  delete row.day_green;
  delete row.day_pink;
  delete row.accent_green;
  delete row.accent_pink;
  const keepLocalBg = !LEGACY_BACKGROUNDS.includes(row.background);
  if (keepLocalBg) row.background = 'synthwave';
  const { error: e2 } = await supabase.from('settings').upsert({ user_id: userId, ...row });
  setLocalBg(keepLocalBg);
  if (e2 && keepLocalBg) {
    // The legacy shape failed too: try again with just the old columns minus the background.
    const rest: Partial<Row> = { ...row };
    delete rest.background;
    await supabase.from('settings').upsert({ user_id: userId, ...rest });
  }
  return { synced: false };
}
