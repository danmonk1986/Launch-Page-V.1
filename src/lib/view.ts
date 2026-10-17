/**
 * How the Launch Page scrolls, kept per device (a laptop and a phone can differ).
 * free = normal scrolling. cards = each scroll lands on the next card, and the routine
 * stays fixed beside them, following the time.
 */
export type ScrollMode = 'free' | 'cards';
const KEY = 'launchpage.scroll.v1';

export function readScrollMode(): ScrollMode {
  try {
    return localStorage.getItem(KEY) === 'cards' ? 'cards' : 'free';
  } catch {
    return 'free';
  }
}

export function writeScrollMode(m: ScrollMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}
