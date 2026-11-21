/**
 * V20-446 (Dan, Nov 20): beta feedback. Testers send it from the Feedback flag (any time) or the "How was setup?"
 * form (once, after their first setup). It lands in the `feedback` table (0076): testers can only add; only the admin
 * reads it, in ⚙ › Beta Testers › Feedback, and a morning check files new items into the bug log.
 */
import { supabase } from './supabase';

export const HANGUPS = ['Something broke', 'Confusing', 'Too slow', 'Missing something', 'An idea', 'Just love it'] as const;
export type Hangup = (typeof HANGUPS)[number];
/** Feeling, 1 to 5. */
export const FEELINGS = [
  { v: 1, face: '🤬', label: 'Angry' },
  { v: 2, face: '😬', label: 'Yikes' },
  { v: 3, face: '😐', label: 'Okay' },
  { v: 4, face: '🙂', label: 'Good' },
  { v: 5, face: '🥰', label: 'Smitten' }
] as const;

declare const __BUILD__: string;

function device() {
  const ua = navigator.userAgent;
  const phone = /iPhone|Android.+Mobile|Windows Phone/i.test(ua);
  const tablet = !phone && /iPad|Android|Tablet/i.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return {
    type: phone ? 'phone' : tablet ? 'tablet' : 'computer',
    browser,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    ua
  };
}

export async function sendFeedback(f: { kind: 'flag' | 'setup'; hangup: string | null; words: string; feeling: number | null; page: string; setupSeconds?: number | null }): Promise<string | null> {
  if (!supabase) return 'No connection right now.';
  let build = '';
  try {
    build = __BUILD__;
  } catch {
    build = '';
  }
  const { error } = await supabase.from('feedback').insert({
    kind: f.kind,
    hangup: f.hangup,
    words: f.words.trim() || null,
    feeling: f.feeling,
    page: f.page,
    device: device(),
    app_build: build || null,
    setup_seconds: f.setupSeconds ?? null
  });
  return error ? error.message : null;
}
