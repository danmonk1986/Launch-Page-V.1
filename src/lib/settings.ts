import { supabase } from './supabase';

/** In order: three dark, then three light. */
export const BACKGROUNDS = ['synthwave', 'night', 'navy', 'damascus', 'snow', 'white'] as const;
export type Background = (typeof BACKGROUNDS)[number];
export const LIGHT_BACKGROUNDS: readonly Background[] = ['damascus', 'snow', 'white'];
/** The backgrounds Supabase accepted before 0012_backgrounds.sql. */

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
  /** Your own background images (resized JPEG data), one per mode; null = the chosen background. */
  nightBgImage: string | null;
  dayBgImage: string | null;
  /** V20-113: Settings › Account Information. */
  account: AccountInfo;
  /** V20-120: the background each side of the day / night switch goes to. */
  dayBackground: Background;
  nightBackground: Background;
}

/** V20-113 (Dan, Nov 12): who you are and your business. Kept in one column (settings.account). */
export interface AccountInfo {
  alias: string;
  /** Show the alias wherever your name would show. */
  hideRealName: boolean;
  businessName: string;
  role: string;
  /** V20-117: picked from INDUSTRIES; 'Other' uses industryOther. */
  industry: string;
  industryOther: string;
  /** V20-117: picked from DESCRIBES; 'Other' uses describesOther. */
  describes: string;
  describesOther: string;
  backupEmail: string;
  /** V20-118: the backup email signs in to this account too (and counts for anything email-related later). */
  linkEmails: boolean;
  /** V20-114: dates as YYYY-MM-DD. */
  birthday: string;
  businessFounded: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export const EMPTY_ACCOUNT: AccountInfo = {
  alias: '', hideRealName: false, businessName: '', role: '', industry: '', industryOther: '', describes: '', describesOther: '', backupEmail: '', linkEmails: false, birthday: '', businessFounded: '',
  street: '', city: '', region: '', postalCode: '', country: ''
};

/** V20-117 (Dan, Nov 12): data collection, each a drop-down with Other. */
export const INDUSTRIES = [
  'Design & creative', 'Software & tech', 'Marketing & media', 'Consulting & coaching', 'Energy & resources', 'Trades & construction',
  'Retail & e-commerce', 'Hospitality & events', 'Health & wellness', 'Education', 'Finance & accounting', 'Real estate', 'Other'
];
export const DESCRIBES = [
  'Company of one', 'Freelancer', 'Startup founder', 'Digital nomad', 'Small business owner', 'Side project (with a day job)',
  'Creator', 'Student', 'Other'
];

/** The name to show: the alias when the real name is hidden (and an alias is set). */
export const shownName = (s: BrandSettings) => (s.account.hideRealName && s.account.alias.trim() ? s.account.alias.trim() : s.displayName);

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
  // Day mode: the same four colour codes as night mode (V20-048, Dan, Nov 11).
  dayPurple: '#8869cb',
  dayTeal: '#06f9c2',
  dayGreen: '#98ee92',
  dayPink: '#ff6ad5',
  nightBgImage: null,
  dayBgImage: null,
  account: EMPTY_ACCOUNT,
  dayBackground: 'damascus',
  nightBackground: 'synthwave'
};

/** V20-120: day mode = a light background. */
export const isDay = (b: Background) => LIGHT_BACKGROUNDS.includes(b);
/** Picking a background also remembers it for its side of the switch. */
export const withBackground = (s: BrandSettings, b: Background): BrandSettings =>
  isDay(b) ? { ...s, background: b, dayBackground: b } : { ...s, background: b, nightBackground: b };
/** The switch: go to the other side's remembered background. */
export const flipDayNight = (s: BrandSettings, toDay: boolean): BrandSettings => withBackground(s, toDay ? s.dayBackground : s.nightBackground);

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
    const parsed = JSON.parse(raw);
    const s = upgradePalette({ ...DEFAULT_SETTINGS, ...parsed, account: { ...EMPTY_ACCOUNT, ...(parsed.account ?? {}) } });
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
  night_bg_image?: string | null;
  day_bg_image?: string | null;
  account?: Partial<AccountInfo> | null;
  day_background?: string | null;
  night_background?: string | null;
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
  accent_pink: s.accentPink,
  day_purple: s.dayPurple,
  day_teal: s.dayTeal,
  day_green: s.dayGreen,
  day_pink: s.dayPink,
  night_bg_image: s.nightBgImage,
  day_bg_image: s.dayBgImage,
  account: s.account,
  day_background: s.dayBackground,
  night_background: s.nightBackground
});

const fromRow = (r: Row): BrandSettings => ({
  displayName: r.display_name,
  logoText: r.logo_text,
  logoUrl: r.logo_url,
  goal: r.goal,
  mantra: r.mantra,
  background: normalizeBackground(r.background),
  accentPurple: r.accent_purple,
  accentTeal: r.accent_teal,
  // Before 0007 is run these columns are missing: keep this device's choice.
  accentGreen: r.accent_green ?? readLocal().accentGreen,
  accentPink: r.accent_pink ?? readLocal().accentPink,
  // Before 0021 is run the day colours live on this device.
  dayPurple: r.day_purple ?? readLocal().dayPurple,
  dayTeal: r.day_teal ?? readLocal().dayTeal,
  dayGreen: r.day_green ?? readLocal().dayGreen,
  dayPink: r.day_pink ?? readLocal().dayPink,
  // Before 0022 is run the background images live on this device.
  nightBgImage: r.night_bg_image !== undefined ? r.night_bg_image : readLocal().nightBgImage,
  dayBgImage: r.day_bg_image !== undefined ? r.day_bg_image : readLocal().dayBgImage,
  account: { ...EMPTY_ACCOUNT, ...(r.account ?? {}) },
  ...modeBackgrounds(normalizeBackground(r.background), r.day_background, r.night_background)
});

/** The remembered background for each mode; the current one fills its own side when nothing is saved yet. */
function modeBackgrounds(current: Background, day?: string | null, night?: string | null) {
  const d = day ? normalizeBackground(day) : null;
  const n = night ? normalizeBackground(night) : null;
  return {
    dayBackground: d && LIGHT_BACKGROUNDS.includes(d) ? d : LIGHT_BACKGROUNDS.includes(current) ? current : 'damascus',
    nightBackground: n && !LIGHT_BACKGROUNDS.includes(n) ? n : !LIGHT_BACKGROUNDS.includes(current) ? current : 'synthwave'
  } as { dayBackground: Background; nightBackground: Background };
}

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
  // V20-008: every column, every time (the old fallbacks that dropped images and day colours
  // when a save failed are gone now that every setup script is run).
  const { error } = await supabase.from('settings').upsert({ user_id: userId, ...toRow(s) });
  return { synced: !error };
}

/**
 * V20-118: keep the account's linked email (public.account_emails) in step with Account Information.
 * Ticked with a backup email = that email signs in to this account; unticked = no linked email.
 * Returns an error to show, or null.
 */
export async function syncLinkedEmail(userId: string | null, a: AccountInfo): Promise<string | null> {
  if (!supabase || !userId) return null;
  const want = a.linkEmails ? a.backupEmail.trim().toLowerCase() : '';
  const { data, error } = await supabase.from('account_emails').select('email').eq('user_id', userId);
  if (error) return `Linked email not saved: ${error.message}`;
  const have = (data ?? []).map((r: { email: string }) => r.email);
  const drop = have.filter((e) => e !== want);
  if (drop.length) {
    const { error: del } = await supabase.from('account_emails').delete().eq('user_id', userId).in('email', drop);
    if (del) return `Linked email not saved: ${del.message}`;
  }
  if (want && !have.includes(want)) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(want)) return 'Linked email not saved: the backup email doesn’t look right.';
    const { error: add } = await supabase.from('account_emails').insert({ email: want, user_id: userId });
    if (add) return /duplicate|already/i.test(add.message) ? `Linked email not saved: ${/sign-in email/.test(add.message) ? 'that is already your sign-in email.' : 'that email is already used by another account.'}` : `Linked email not saved: ${add.message}`;
  }
  return null;
}
