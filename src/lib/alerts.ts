/**
 * Launch alerts: a chime made with the Web Audio API (no sound files) and optional
 * desktop notifications. Browsers keep pages silent until the person has clicked once,
 * so the audio unlocks on the first click or key press after the page opens.
 */

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

/** The alarm sounds, all made in the browser (no sound files). */
export const TONES = [
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'beep', label: 'Alarm clock' },
  { id: 'marimba', label: 'Marimba' }
] as const;
export type Tone = (typeof TONES)[number]['id'];
export const isTone = (x: unknown): x is Tone => TONES.some((t) => t.id === x);

type Note = { f: number; at: number; len: number; type: OscillatorType; vol: number; to?: number; partials?: number[] };

function play(a: AudioContext, notes: Note[]) {
  const t0 = a.currentTime + 0.02;
  for (const n of notes) {
    for (const [k, mult] of (n.partials ?? [1]).entries()) {
      const at = t0 + n.at;
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.f * mult, at);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to * mult, at + n.len);
      const vol = n.vol / (k + 1);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + n.len);
      osc.connect(gain).connect(a.destination);
      osc.start(at);
      osc.stop(at + n.len + 0.05);
    }
  }
}

const seq = (freqs: number[], step: number, len: number, type: OscillatorType, vol: number, offset = 0): Note[] =>
  freqs.map((f, i) => ({ f, at: offset + i * step, len, type, vol }));

/** The notes for each sound. start = launch time; end = the time allotted is up (played as a pair). */
function score(tone: Tone, kind: 'start' | 'end'): Note[] {
  const up = kind === 'start';
  switch (tone) {
    case 'bell': {
      const strike = (at: number, f: number): Note => ({ f, at, len: 2.2, type: 'sine', vol: 0.22, partials: [1, 2.76, 5.4] });
      return up ? [strike(0, 880)] : [strike(0, 880), strike(0.9, 660)];
    }
    case 'rocket':
      return up
        ? [
            { f: 110, to: 880, at: 0, len: 0.9, type: 'sawtooth', vol: 0.08 },
            { f: 220, to: 1760, at: 0.05, len: 0.9, type: 'triangle', vol: 0.12 }
          ]
        : [
            { f: 880, to: 110, at: 0, len: 0.8, type: 'sawtooth', vol: 0.08 },
            { f: 880, to: 110, at: 0.95, len: 0.8, type: 'sawtooth', vol: 0.08 }
          ];
    case 'arcade':
      return up
        ? seq([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.07, 0.12, 'square', 0.07)
        : [...seq([1046.5, 783.99, 659.25, 523.25], 0.09, 0.14, 'square', 0.07), ...seq([1046.5, 783.99, 659.25, 523.25], 0.09, 0.14, 'square', 0.07, 0.6)];
    case 'beep': {
      const three = (o: number) => seq([988, 988, 988], 0.16, 0.1, 'square', 0.06, o);
      return up ? [...three(0), ...three(0.7)] : [...three(0), ...three(0.7), ...three(1.4), ...three(2.1)];
    }
    case 'marimba':
      return up
        ? seq([392, 523.25, 659.25, 783.99], 0.13, 0.5, 'triangle', 0.22)
        : [...seq([783.99, 659.25, 523.25, 392], 0.13, 0.5, 'triangle', 0.22), ...seq([783.99, 659.25, 523.25, 392], 0.13, 0.5, 'triangle', 0.22, 0.8)];
    default: {
      const notes = up ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25, 783.99, 659.25, 523.25];
      return notes.map((f, i) => ({ f, at: i * 0.18 + (!up && i >= 3 ? 0.25 : 0), len: 0.45, type: 'sine' as OscillatorType, vol: 0.25 }));
    }
  }
}

/** Plays the launch's alarm: start = launch time, end = time's up. */
export function chime(kind: 'start' | 'end', tone: Tone = 'chime') {
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') a.resume();
  play(a, score(tone, kind));
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
