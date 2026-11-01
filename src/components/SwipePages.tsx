import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Nov 1 mobile card standard: a list shows 3 at a time and you swipe left for the next 3,
 * with dots and "1–3 of 7" underneath. Same look as Timed Launches (styles: .timed-pages).
 * `pages` is already split into groups; `total` is the item count for the label.
 */
export function SwipePages({ pages, total, per = 3, resetKey }: { pages: ReactNode[]; total: number; per?: number; resetKey?: unknown }) {
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPage(0);
    ref.current?.scrollTo({ left: 0 });
  }, [resetKey, pages.length]);
  return (
    <>
      <div
        ref={ref}
        className={`timed-pages${pages.length > 1 ? ' is-paged' : ''}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) setPage(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {pages.map((pg, i) => (
          <div className="swipe-page" key={i} aria-label={pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : undefined}>
            {pg}
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="timed-dots" aria-hidden="true">
          {pages.map((_, i) => (
            <span key={i} className={i === page ? 'is-on' : ''} />
          ))}
          <span className="timed-dots-label">
            {page * per + 1}–{Math.min(page * per + per, total)} of {total}
          </span>
        </div>
      )}
    </>
  );
}

/** Splits a list into groups of `per` (3 by default). */
export function chunk<T>(list: T[], per = 3): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
  return out;
}
