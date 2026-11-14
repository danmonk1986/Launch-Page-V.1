import { supabase } from './supabase';

/**
 * V20-129 (Dan, Nov 12): five tiles per mode in Appearance › Background. Four backgrounds (any one can be swapped for
 * your own image: '<mode>-img-<slot>') and a colour ('<mode>-colour'). Navy and White became the colour tiles.
 */
export const NIGHT_TILES = ['synthwave', 'night', 'planets', 'vats'] as const;
// V20-138 (Dan, Nov 12): day and night line up as pairs: Damascus · Synthwave, Snowy day · Starry night, Blue sky · Planets, 2001 · The Lab.
export const DAY_TILES = ['damascus', 'snow', 'starship', 'corridor'] as const;
export const BACKGROUNDS = [
  ...NIGHT_TILES, 'night-colour', 'night-img-0', 'night-img-1', 'night-img-2', 'night-img-3',
  ...DAY_TILES, 'day-colour', 'day-img-0', 'day-img-1', 'day-img-2', 'day-img-3'
] as const;
export type Background = (typeof BACKGROUNDS)[number];
export const LIGHT_BACKGROUNDS: readonly Background[] = BACKGROUNDS.filter((b) => (DAY_TILES as readonly string[]).includes(b) || b.startsWith('day-'));
export const BG_NAME: Record<string, string> = {
  synthwave: 'Synthwave', night: 'Starry night', planets: 'Planets', vats: 'The Lab',
  damascus: 'Damascus', snow: 'Snowy day', corridor: '2001', starship: 'Blue sky'
};

/** Old names: Plain → Navy (Oct 16) → the night colour; White → the day colour; anything unknown → Synthwave. */
function normalizeBackground(b: string): Background {
  if (b === 'plain' || b === 'navy') return 'night-colour';
  if (b === 'white') return 'day-colour';
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
  /** Rocket colours 3 and 4. Purple and Teal are 1 and 2 and also colour the whole app. */
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
  /** V20-129: the colour tile of each mode. */
  nightColour: string;
  dayColour: string;
  /** V20-144 (Dan, Nov 12): Neutral, main colour 1: the text colour of each mode (grey by day, beige by night). */
  dayNeutral: string;
  nightNeutral: string;
  /** V20-146 (Dan, Nov 12): CARDS + HEADER, each mode's header and card colour and how solid each is (0–100). */
  surfaces: Surfaces;
  /** V20-156 (Dan, Nov 12): MODULES, which cards the Launch Page shows, and whether the routine follows the time. */
  modules: Modules;
}

/** V20-158 (Dan, Nov 13): modules in sections. Launch Page essentials are on by default; everything from Personal
 *  Alchemy down is off by default. Some are still to be built (MODULE_SOON). */
export interface Modules {
  rockets: boolean; routine: boolean; tasks: boolean; week: boolean;
  journal: boolean; days26: boolean; goals: boolean; milestones: boolean;
  budget: boolean; trips: boolean;
  invoice: boolean; records: boolean; crm: boolean; marketing: boolean; planner: boolean;
}
export const DEFAULT_MODULES: Modules = {
  rockets: true, routine: true, tasks: true, week: true,
  journal: false, days26: false, goals: false, milestones: false,
  budget: false, trips: false,
  invoice: false, records: false, crm: false, marketing: false, planner: false
};
/** Not built yet: shown greyed out with Coming soon. */
export const MODULE_SOON: (keyof Modules)[] = ['goals', 'milestones', 'trips', 'crm', 'marketing', 'planner'];

export interface Surface { header: string; headerSolid: number; card: string; cardSolid: number }
export interface Surfaces { day: Surface; night: Surface }
export const DEFAULT_SURFACES: Surfaces = {
  day: { header: '#ffffff', headerSolid: 86, card: '#f5f5eb', cardSolid: 82 },
  night: { header: '#0f0b22', headerSolid: 86, card: '#120d28', cardSolid: 82 }
};

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
  // V20-150 (Dan, Nov 12): the brand default is the L4UNCH!P4GE logo (no logo set), Undeniable in 2026, search. create. evolve.
  goal: 'Undeniable in 2026',
  mantra: 'search. create. evolve.',
  // V20-151 (Dan, Nov 12): default backgrounds Damascus (day) and Synthwave (night); the colour tiles default to darker
  // beige and navy (V20-143).
  background: 'synthwave',
  accentPurple: '#8869cb',
  accentTeal: '#06f9c2',
  accentGreen: '#98ee92',
  accentPink: '#ff6300',
  // V20-152 (Dan, Nov 12): main colour defaults. Day mode: the same four colour codes as night mode (V20-048, Dan, Nov 11).
  dayPurple: '#8869cb',
  dayTeal: '#0daeaa',
  dayGreen: '#98ee92',
  dayPink: '#ff6300',
  nightBgImage: null,
  dayBgImage: null,
  account: EMPTY_ACCOUNT,
  dayBackground: 'damascus',
  nightBackground: 'synthwave',
  nightColour: '#0b0820',
  dayColour: '#f5f5dc',
  dayNeutral: '#444242',
  nightNeutral: '#f5f5dc',
  surfaces: DEFAULT_SURFACES,
  modules: DEFAULT_MODULES
};

/** V20-120: day mode = a light background. */
export const isDay = (b: Background) => LIGHT_BACKGROUNDS.includes(b);
/** Picking a background sets it for its side of the switch. V20-141 (Dan, Nov 12): the switch alone decides which side
 *  shows, so picking a night tile in day mode saves it for night and the page stays on day. */
export const withBackground = (s: BrandSettings, b: Background): BrandSettings => {
  const day = isDay(b);
  const next = day ? { ...s, dayBackground: b } : { ...s, nightBackground: b };
  return isDay(s.background) === day ? { ...next, background: b } : next;
};
/** The switch: go to that side's saved background. */
export const flipDayNight = (s: BrandSettings, toDay: boolean): BrandSettings => {
  const b = toDay ? s.dayBackground : s.nightBackground;
  return { ...s, background: b };
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
    const parsed = JSON.parse(raw);
    const s = upgradePalette({ ...DEFAULT_SETTINGS, ...parsed, account: { ...EMPTY_ACCOUNT, ...(parsed.account ?? {}) }, modules: { ...DEFAULT_MODULES, ...(parsed.modules ?? {}) } });
    const bg = normalizeBackground(s.background);
    return { ...s, background: bg, ...modeBackgrounds(bg, s.dayBackground, s.nightBackground) };
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
  night_colour?: string | null;
  day_neutral?: string | null;
  night_neutral?: string | null;
  surfaces?: Partial<Record<'day' | 'night', Partial<Surface>>> | null;
  modules?: Partial<Modules> | null;
  day_colour?: string | null;
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
  night_background: s.nightBackground,
  night_colour: s.nightColour,
  day_colour: s.dayColour,
  day_neutral: s.dayNeutral,
  night_neutral: s.nightNeutral,
  surfaces: s.surfaces,
  modules: s.modules
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
  ...modeBackgrounds(normalizeBackground(r.background), r.day_background, r.night_background),
  nightColour: r.night_colour || (r.background === 'navy' || r.background === 'plain' ? '#0b0820' : DEFAULT_SETTINGS.nightColour),
  dayColour: r.day_colour || (r.background === 'white' ? '#ffffff' : DEFAULT_SETTINGS.dayColour),
  dayNeutral: r.day_neutral || DEFAULT_SETTINGS.dayNeutral,
  nightNeutral: r.night_neutral || DEFAULT_SETTINGS.nightNeutral,
  surfaces: {
    day: { ...DEFAULT_SURFACES.day, ...(r.surfaces?.day ?? {}) },
    night: { ...DEFAULT_SURFACES.night, ...(r.surfaces?.night ?? {}) }
  },
  modules: { ...DEFAULT_MODULES, ...(r.modules ?? {}) }
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

/** V20-172 (Nov 13): what changed between two copies, one level deep for grouped settings (account, modules,
 *  surfaces), so a save only carries the fields someone actually changed. */
export function settingsPatch(before: BrandSettings, after: BrandSettings): Partial<BrandSettings> {
  const out: Record<string, unknown> = {};
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  for (const k of Object.keys(after) as (keyof BrandSettings)[]) {
    const a = before[k] as unknown, b = after[k] as unknown;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (isObj(a) && isObj(b)) {
      const sub: Record<string, unknown> = {};
      for (const sk of Object.keys(b)) if (JSON.stringify(a[sk]) !== JSON.stringify(b[sk])) sub[sk] = b[sk];
      out[k] = sub;
    } else out[k] = b;
  }
  return out as Partial<BrandSettings>;
}
/** Applies a patch from settingsPatch: grouped settings merge, everything else replaces. */
export function applySettingsPatch(s: BrandSettings, patch: Partial<BrandSettings>): BrandSettings {
  const next = { ...s } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    const cur = next[k];
    next[k] = cur && typeof cur === 'object' && !Array.isArray(cur) && v && typeof v === 'object' && !Array.isArray(v) ? { ...(cur as object), ...(v as object) } : v;
  }
  return next as unknown as BrandSettings;
}

/**
 * V20-172 (Dan, Nov 13): Account Information and the module switches were wiped by a save from a device whose
 * Settings form still held an old copy (every save wrote every column). Now a save writes only the columns that
 * changed, and grouped columns (account, modules, surfaces) are merged into what the cloud holds, field by field,
 * so a stale device can't put back old values it never touched.
 */
export async function saveSettingsPatch(userId: string | null, prev: BrandSettings, full: BrandSettings, patch: Partial<BrandSettings>): Promise<{ synced: boolean }> {
  writeLocal(full);
  if (!supabase || !userId) return { synced: false };
  const all = toRow(full) as Record<string, unknown>;
  const was = toRow(prev) as Record<string, unknown>;
  const cols = Object.keys(all).filter((c) => JSON.stringify(all[c]) !== JSON.stringify(was[c]));
  if (!cols.length) return { synced: true };
  const grouped: Record<string, keyof BrandSettings> = { account: 'account', modules: 'modules', surfaces: 'surfaces' };
  const write: Record<string, unknown> = {};
  const needCloud = cols.filter((c) => grouped[c]);
  let cloud: Record<string, unknown> | null = null;
  if (needCloud.length) {
    const { data } = await supabase.from('settings').select(needCloud.join(',')).eq('user_id', userId).maybeSingle();
    cloud = (data as Record<string, unknown> | null) ?? null;
  }
  for (const c of cols) {
    const key = grouped[c];
    if (key && cloud && cloud[c] && typeof cloud[c] === 'object') write[c] = { ...(cloud[c] as object), ...((patch[key] as object) ?? {}) };
    else write[c] = all[c];
  }
  if (!Object.keys(write).length) return { synced: true };
  const { error } = await supabase.from('settings').upsert({ user_id: userId, ...write });
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

// ---------- V20-129: your own background images (one per tile slot, kept apart from the settings row) ----------
export type BgMode = 'day' | 'night';
export type BgSlots = Record<BgMode, (string | null)[]>;
export const EMPTY_SLOTS: BgSlots = { day: [null, null, null, null], night: [null, null, null, null] };

export async function loadBgImages(userId: string | null): Promise<BgSlots> {
  const out: BgSlots = { day: [null, null, null, null], night: [null, null, null, null] };
  if (!supabase || !userId) return out;
  const { data } = await supabase.from('background_images').select('mode, slot, image').eq('user_id', userId);
  for (const r of (data ?? []) as { mode: BgMode; slot: number; image: string }[]) if (out[r.mode]) out[r.mode][r.slot] = r.image;
  return out;
}

/** Puts an image in a tile slot, or (null) takes it out so the default comes back. */
export async function saveBgImage(userId: string | null, mode: BgMode, slot: number, image: string | null): Promise<boolean> {
  if (!supabase || !userId) return false;
  const q = supabase.from('background_images');
  const { error } = image
    ? await q.upsert({ user_id: userId, mode, slot, image, updated_at: new Date().toISOString() })
    : await q.delete().eq('user_id', userId).eq('mode', mode).eq('slot', slot);
  return !error;
}

/** What a background id draws: a built-in tile, a colour, or an image (falls back to its slot's default). */
export function resolveBackground(b: Background, slots: BgSlots): { tile: string; image: string | null } {
  const m = /^(day|night)-img-(\d)$/.exec(b);
  if (!m) return { tile: b, image: null };
  const mode = m[1] as BgMode;
  const slot = Number(m[2]);
  const image = slots[mode][slot];
  return { tile: (mode === 'day' ? DAY_TILES : NIGHT_TILES)[slot], image };
}
