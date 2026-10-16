/**
 * Google Calendar, straight from the browser. Google's sign-in hands the app an access
 * token that lasts about an hour; only the public Client ID lives in the app, never a secret.
 * The token is kept in memory and this tab's session storage, never in Supabase.
 */
import { addDays, type CalEvent } from './events';
import { isoDate } from './launchers';

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
export const googleConfigured = () => !!GOOGLE_CLIENT_ID;

// events: read and write events on every calendar; calendarlist.readonly: see which calendars you have.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const BASE = 'https://www.googleapis.com/calendar/v3';
const eventsUrl = (calendarId: string) => `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
const SCOPE_KEY = 'launchpage.google.scope.v1';
const TOKEN_KEY = 'launchpage.google.token.v1';
const CONNECTED_KEY = 'launchpage.google.connected.v1';

type Token = { value: string; expires: number };

// Minimal typing for Google Identity Services.
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void };
type GIS = { accounts: { oauth2: { initTokenClient: (c: object) => TokenClient; revoke: (t: string, done?: () => void) => void } } };

let token: Token | null = (() => {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    const t = raw ? (JSON.parse(raw) as Token) : null;
    return t && t.expires > Date.now() ? t : null;
  } catch {
    return null;
  }
})();

export const wasConnected = () => {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1';
  } catch {
    return false;
  }
};
const setConnected = (on: boolean) => {
  try {
    if (on) localStorage.setItem(CONNECTED_KEY, '1');
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    /* ignore */
  }
};

export const hasToken = () => !!token && token.expires > Date.now() + 30_000;

let gisLoad: Promise<GIS> | null = null;
function loadGis(): Promise<GIS> {
  const w = window as unknown as { google?: GIS };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => {
      gisLoad = null;
      reject(new Error('Could not reach Google sign-in.'));
    };
    document.head.appendChild(s);
  });
  return gisLoad;
}

/** Load the sign-in script early so the Connect click opens the pop-up straight away. */
export function preloadGoogle() {
  if (googleConfigured()) loadGis().catch(() => undefined);
}

let client: TokenClient | null = null;

/**
 * Must run from a click: Google shows a pop-up the first time (choose account, allow
 * calendar), then just a quick flash on later renewals.
 */
export async function connectGoogle(): Promise<void> {
  const gis = await loadGis();
  return new Promise((resolve, reject) => {
    client ??= gis.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPE, callback: () => undefined });
    client.callback = (r) => {
      if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'Google access was not allowed.' : 'Google sign-in was closed.'));
      token = { value: r.access_token, expires: Date.now() + (r.expires_in ?? 3600) * 1000 };
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      } catch {
        /* ignore */
      }
      setConnected(true);
      try {
        localStorage.setItem(SCOPE_KEY, SCOPE);
      } catch {
        /* ignore */
      }
      resolve();
    };
    // Ask again (consent) the first time, or when the app needs a new kind of access.
    let sameScope = false;
    try {
      sameScope = localStorage.getItem(SCOPE_KEY) === SCOPE;
    } catch {
      /* ignore */
    }
    client.requestAccessToken({ prompt: wasConnected() && sameScope ? '' : 'consent' });
  });
}

export async function disconnectGoogle() {
  const t = token?.value;
  token = null;
  setConnected(false);
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (t) {
    const gis = await loadGis().catch(() => null);
    gis?.accounts.oauth2.revoke(t);
  }
}

export class GoogleAuthError extends Error {}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!hasToken()) throw new GoogleAuthError('Reconnect Google Calendar.');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token!.value}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
  });
  if (res.status === 401 || res.status === 403) {
    token = null;
    throw new GoogleAuthError('Reconnect Google Calendar.');
  }
  if (!res.ok) throw new Error(`Google Calendar said no (${res.status}).`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ---------- Mapping ----------

type GDate = { date?: string; dateTime?: string };
type GEvent = { id: string; summary?: string; start: GDate; end: GDate; htmlLink?: string; status?: string };

const dayOf = (g: GDate) => (g.date ? g.date : isoDate(new Date(g.dateTime!)));
const nextDay = (iso: string) => isoDate(addDays(new Date(`${iso}T12:00:00`), 1));
const prevDay = (iso: string) => isoDate(addDays(new Date(`${iso}T12:00:00`), -1));

/**
 * Pastel neons instead of Google's colours, so each calendar's edge pops against the
 * striped synthwave background. Areas get fixed colours; any other calendar gets one
 * from the palette by name (always the same one). Editable per area in a later step.
 */
const NEON = ['#06F9C2', '#B794FF', '#FF6AD5', '#9DFF8A', '#7FDBFF', '#FFE066', '#FF9F68', '#5CE1E6', '#FF8FAB', '#C3F73A'];
const AREA_NEON: [RegExp, string][] = [
  [/ltd/i, '#C8C6C6'], // STARDVST LTD: tax prep and the boring stuff, in grey
  [/theme/i, '#06F9C2'],
  [/danmonk/i, '#B794FF'],
  [/fntsy|travel|adventure/i, '#FF9F68'],
  [/health|wellness/i, '#FF8FAB'],
  [/brand/i, '#7FDBFF'],
  [/mwd/i, '#FFE066'],
  [/app shop|launch|stream|zaptor/i, '#9DFF8A']
];
function neonFor(cal: { id: string; summary?: string }) {
  const name = cal.summary ?? cal.id;
  const hit = AREA_NEON.find(([re]) => re.test(name));
  if (hit) return hit[1];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NEON[h % NEON.length];
}

type Cal = { id: string; summary?: string; backgroundColor?: string; accessRole?: string; selected?: boolean; primary?: boolean };

function fromGoogle(g: GEvent, cal: Cal = { id: 'primary', accessRole: 'owner' }): CalEvent {
  const allDay = !!g.start.date;
  const start = dayOf(g.start);
  // All-day end dates in Google are the day after; timed events end on their own date.
  let end = allDay ? prevDay(g.end.date!) : dayOf(g.end);
  if (end < start) end = start;
  return {
    id: `g:${g.id}`,
    title: g.summary || '(No title)',
    startDate: start,
    endDate: end,
    color: 'blue',
    sort: 0,
    google: {
      id: g.id,
      calendarId: cal.id,
      calendar: cal.summary ?? null,
      color: neonFor(cal),
      readOnly: cal.accessRole !== 'owner' && cal.accessRole !== 'writer',
      link: g.htmlLink ?? null,
      time: allDay ? null : new Date(g.start.dateTime!).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
    }
  };
}

export type GoogleCalendar = Cal;

let primaryCal: Cal = { id: 'primary', accessRole: 'owner' };
const CALS_KEY = 'launchpage.google.calendars.v1';

/** The calendars seen last time (kept on this device so Projects can list them offline). */
export function knownCalendars(): GoogleCalendar[] {
  try {
    return JSON.parse(localStorage.getItem(CALS_KEY) ?? '[]') as GoogleCalendar[];
  } catch {
    return [];
  }
}

/** The calendars ticked in Google Calendar's sidebar. */
async function listCalendars(): Promise<Cal[]> {
  const data = await call<{ items: Cal[] }>(`${BASE}/users/me/calendarList?minAccessRole=reader&maxResults=250`);
  // Shown calendars only, and never Google's holiday calendars (no holidays off as a consultant).
  const cals = (data.items ?? []).filter((c) => c.selected !== false && !c.id.includes('#holiday@group.v.calendar.google.com'));
  primaryCal = cals.find((c) => c.primary) ?? primaryCal;
  try {
    localStorage.setItem(CALS_KEY, JSON.stringify(cals.map(({ id, summary, accessRole, primary }) => ({ id, summary, accessRole, primary }))));
  } catch {
    /* ignore */
  }
  return cals.length ? cals : [primaryCal];
}

/** Every event this week across all your shown calendars. */
export async function listGoogleEvents(from: string, to: string): Promise<CalEvent[]> {
  const q = new URLSearchParams({
    timeMin: new Date(`${from}T00:00:00`).toISOString(),
    timeMax: new Date(`${nextDay(to)}T00:00:00`).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });
  const cals = await listCalendars();
  const lists = await Promise.all(
    cals.map(async (cal) => {
      try {
        const data = await call<{ items: GEvent[] }>(`${eventsUrl(cal.id)}?${q}`);
        return (data.items ?? []).filter((g) => g.status !== 'cancelled').map((g) => fromGoogle(g, cal));
      } catch (err) {
        if (err instanceof GoogleAuthError) throw err;
        return []; // one calendar failing shouldn't hide the rest
      }
    })
  );
  return lists.flat();
}

/** New all-day event in Google Calendar (LaunchPage events are whole days). */
export async function createGoogleEvent(e: CalEvent): Promise<CalEvent> {
  const g = await call<GEvent>(eventsUrl('primary'), {
    method: 'POST',
    body: JSON.stringify({ summary: e.title, start: { date: e.startDate }, end: { date: nextDay(e.endDate) } })
  });
  return fromGoogle(g, primaryCal);
}

/** Rename, and move dates for all-day events. Timed events keep their times. */
export async function updateGoogleEvent(e: CalEvent): Promise<CalEvent> {
  const body: Record<string, unknown> = { summary: e.title };
  if (!e.google?.time) {
    body.start = { date: e.startDate };
    body.end = { date: nextDay(e.endDate) };
  }
  const cal = e.google!;
  const g = await call<GEvent>(`${eventsUrl(cal.calendarId)}/${encodeURIComponent(cal.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
  return fromGoogle(g, { id: cal.calendarId, summary: cal.calendar ?? undefined, backgroundColor: cal.color ?? undefined, accessRole: 'owner' });
}

export async function deleteGoogleEvent(e: CalEvent) {
  await call<void>(`${eventsUrl(e.google!.calendarId)}/${encodeURIComponent(e.google!.id)}`, { method: 'DELETE' });
}
