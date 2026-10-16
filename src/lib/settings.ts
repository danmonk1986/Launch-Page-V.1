import { supabase } from './supabase';

export type Background = 'synthwave' | 'night' | 'plain';

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
  accentPink: '#ff6ad5'
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
    return raw ? upgradePalette({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }) : DEFAULT_SETTINGS;
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
  background: Background;
  accent_purple: string;
  accent_teal: string;
  accent_green?: string;
  accent_pink?: string;
};

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
  accent_pink: s.accentPink
});

const fromRow = (r: Row): BrandSettings => ({
  displayName: r.display_name,
  logoText: r.logo_text,
  logoUrl: r.logo_url,
  goal: r.goal,
  mantra: r.mantra,
  background: r.background,
  accentPurple: r.accent_purple,
  accentTeal: r.accent_teal,
  // Before 0007 is run these columns are missing: keep this device's choice.
  accentGreen: r.accent_green ?? readLocal().accentGreen,
  accentPink: r.accent_pink ?? readLocal().accentPink
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
  if (!error) return { synced: true };
  // 0007 not run yet: save everything else; the two new colours stay on this device.
  delete row.accent_green;
  delete row.accent_pink;
  await supabase.from('settings').upsert({ user_id: userId, ...row });
  return { synced: false };
}
