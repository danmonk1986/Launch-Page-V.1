import { useEffect, useRef, useState, type TouchEvent } from 'react';

/** Phone width (Oct 30 mobile layout): menus show one item, the calendar shows 3 days. */
export const MOBILE_QUERY = '(max-width: 640px)';

export function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/**
 * Swipe left / right on touch screens (Oct 30). Introduced on the Calendar, meant to be
 * reused on every card. Only a clearly sideways swipe counts, so scrolling still works.
 */
export function useSwipe(onLeft: () => void, onRight: () => void, on = true) {
  const startAt = useRef<{ x: number; y: number } | null>(null);
  if (!on) return {};
  return {
    onTouchStart: (e: TouchEvent) => {
      startAt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = startAt.current;
      startAt.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onLeft();
      else onRight();
    }
  };
}
