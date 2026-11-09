// KNOWLEDGE!B4SE slide viewer (KB-034): a finished deck opens here, inside LaunchPage, instead of on
// claude.ai. Slides are drawn in a shadow root (so their styles can't touch the app) after slideMarkup()
// has removed anything unsafe. Swipe or tap ‹ › on the iPad; arrow keys, space, Home / End on a keyboard;
// Esc closes.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { deckSlides, type KbDeck, type KbSlideView } from '../lib/kb';
import { SLIDE_CSS, slideMarkup } from '../lib/slideHtml';

type Props = { deck: KbDeck; start: number; onClose: () => void; onSlide?: (num: number) => void };

export function SlideViewer({ deck, start, onClose, onSlide }: Props) {
  const [slides, setSlides] = useState<KbSlideView[] | null>(null);
  const [problem, setProblem] = useState('');
  const [at, setAt] = useState(0);
  const [notes, setNotes] = useState(false);
  const stageHost = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    deckSlides(deck.id)
      .then((s) => {
        if (!live) return;
        if (!s.length) setProblem('This deck’s slides aren’t imported yet.');
        setSlides(s);
        const i = s.findIndex((x) => x.num >= start);
        setAt(i < 0 ? 0 : i);
      })
      .catch((e) => live && setProblem((e as Error).message));
    return () => {
      live = false;
    };
  }, [deck.id, start]);

  const markup = useMemo(() => (slides ?? []).map((s) => slideMarkup(s.html)), [slides]);
  const count = slides?.length ?? 0;
  const go = (i: number) => setAt(Math.max(0, Math.min(count - 1, i)));
  const cur = slides?.[at];

  useEffect(() => {
    if (cur) onSlide?.(cur.num);
  }, [cur, onSlide]);

  // Keys + no page scroll behind the viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) go(at + 1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) go(at - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(count - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  });

  // Draw the slide, scaled to fit the space (16:9, centred).
  useLayoutEffect(() => {
    const host = stageHost.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const draw = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const k = Math.min(w / 1920, h / 1080) || 0;
      const x = (w - 1920 * k) / 2;
      const y = (h - 1080 * k) / 2;
      const stage = root.querySelector<HTMLDivElement>('.stage');
      if (stage) stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    };
    root.innerHTML = `<style>${SLIDE_CSS}</style><div class="stage">${markup[at] ?? ''}</div>`;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => ro.disconnect();
  }, [markup, at, notes]);

  function fullscreen() {
    const el = shell.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  }
  const canFullscreen = typeof document !== 'undefined' && (document.fullscreenEnabled || 'webkitRequestFullscreen' in document.documentElement);

  return (
    <div className="kb-viewer" ref={shell} role="dialog" aria-modal="true" aria-label={`${deck.title} slides`}>
      <div className="kb-viewer-bar">
        <p className="kb-viewer-title">
          <b>{deck.title}</b>
          {cur && <span>{cur.title}</span>}
        </p>
        <div className="kb-viewer-tools">
          {count > 0 && (
            <span className="kb-viewer-count" aria-live="polite">
              {at + 1} / {count}
            </span>
          )}
          <button type="button" className={`kb-viewer-btn${notes ? ' is-on' : ''}`} aria-pressed={notes} onClick={() => setNotes(!notes)}>
            Notes
          </button>
          {canFullscreen && (
            <button type="button" className="kb-viewer-btn" onClick={fullscreen} title="Full screen">
              ⤢
            </button>
          )}
          <a className="kb-viewer-btn" href={cur ? `${deck.url}#slide-${cur.num}` : deck.url} target="_blank" rel="noopener noreferrer" title="Open this deck in Claude (to edit it)">
            Claude ↗
          </a>
          <button type="button" className="kb-viewer-btn kb-viewer-close" onClick={onClose} aria-label="Close slides">
            ×
          </button>
        </div>
      </div>
      <div
        className="kb-viewer-stage"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          const t = e.changedTouches[0];
          touch.current = null;
          if (!t0 || !t) return;
          const dx = t.clientX - t0.x;
          const dy = t.clientY - t0.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? at + 1 : at - 1);
        }}
      >
        <button type="button" className="kb-viewer-nav is-prev" onClick={() => go(at - 1)} disabled={at <= 0} aria-label="Previous slide">
          ‹
        </button>
        <div className="kb-viewer-slide" ref={stageHost} />
        <button type="button" className="kb-viewer-nav is-next" onClick={() => go(at + 1)} disabled={at >= count - 1} aria-label="Next slide">
          ›
        </button>
        {!slides && !problem && <p className="kb-viewer-msg">Loading slides…</p>}
        {problem && (
          <p className="kb-viewer-msg">
            {problem}{' '}
            <a href={deck.url} target="_blank" rel="noopener noreferrer">
              Open it in Claude
            </a>
          </p>
        )}
      </div>
      {notes && cur && <div className="kb-viewer-notes">{cur.notes || 'No notes on this slide.'}</div>}
    </div>
  );
}
