/**
 * Launch alerts: a chime made with the Web Audio API (no sound files) and optional
 * desktop notifications. Browsers keep pages silent until the person has clicked once,
 * so the audio unlocks on the first click or key press after the page opens.
 */

const PREF_KEY = 'launchpage.alerts.v1';

export interface AlertPrefs {
  sound: boolean;
  notify: boolean;
}

export function readAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { sound: true, notify: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { sound: true, notify: false };
}

export function writeAlertPrefs(p: AlertPrefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call once at start-up: the first click or key press unlocks sound for the session. */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    const a = audio();
    if (a && a.state === 'suspended') a.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** start = rising three notes; end = falling three notes, played twice. */
export function chime(kind: 'start' | 'end') {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  const notes = kind === 'start' ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25, 783.99, 659.25, 523.25];
  const t0 = a.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const at = t0 + i * 0.18 + (kind === 'end' && i >= 3 ? 0.25 : 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(gain).connect(a.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  });
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function askNotificationPermission() {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/icon-192.png', tag: title });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
