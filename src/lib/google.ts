/**
 * Google Calendar, straight from the browser. Google's sign-in hands the app an access
 * token that lasts about an hour; only the public Client ID lives in the app, never a secret.
 * The token is kept in memory and this tab's session storage, never in Supabase.
 */
import { addDays, type CalEvent } from './events';
import { isoDate } from './launchers';

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
export const googleConfigured = () => !!GOOGLE_CLIENT_ID;

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
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
      resolve();
    };
    client.requestAccessToken({ prompt: wasConnected() ? '' : 'consent' });
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
  if (res.status === 401) {
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

function fromGoogle(g: GEvent): CalEvent {
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
      link: g.htmlLink ?? null,
      time: allDay ? null : new Date(g.start.dateTime!).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
    }
  };
}

export async function listGoogleEvents(from: string, to: string): Promise<CalEvent[]> {
  const q = new URLSearchParams({
    timeMin: new Date(`${from}T00:00:00`).toISOString(),
    timeMax: new Date(`${nextDay(to)}T00:00:00`).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250'
  });
  const data = await call<{ items: GEvent[] }>(`${API}?${q}`);
  return (data.items ?? []).filter((g) => g.status !== 'cancelled').map(fromGoogle);
}

/** New all-day event in Google Calendar (LaunchPage events are whole days). */
export async function createGoogleEvent(e: CalEvent): Promise<CalEvent> {
  const g = await call<GEvent>(API, {
    method: 'POST',
    body: JSON.stringify({ summary: e.title, start: { date: e.startDate }, end: { date: nextDay(e.endDate) } })
  });
  return fromGoogle(g);
}

/** Rename, and move dates for all-day events. Timed events keep their times. */
export async function updateGoogleEvent(e: CalEvent): Promise<CalEvent> {
  const body: Record<string, unknown> = { summary: e.title };
  if (!e.google?.time) {
    body.start = { date: e.startDate };
    body.end = { date: nextDay(e.endDate) };
  }
  const g = await call<GEvent>(`${API}/${encodeURIComponent(e.google!.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
  return fromGoogle(g);
}

export async function deleteGoogleEvent(e: CalEvent) {
  await call<void>(`${API}/${encodeURIComponent(e.google!.id)}`, { method: 'DELETE' });
}
