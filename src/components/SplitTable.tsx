import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * V20-104 / V20-109 (Dan, Nov 12): a table that splits where its ✓ ⋯ start, so nothing floats over the rows.
 * `left` is the table without its ✓ ⋯ cells; `right` is a one-column table of them. Rows pair up by `data-row`
 * (every tr in both, header and group rows too). The left scrolls sideways in its own box that ends at the
 * split; each right row takes its left row's height; both scroll up and down together, with the one up-and-down
 * bar on the outside (the left's own bar is tucked past a clipping edge, see `.task-clip`); hover lights both halves.
 */
export function SplitTable({ left, right }: { left: ReactNode; right: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pins = useRef<HTMLDivElement>(null);
  const follow = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (from && to && to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
  };
  const sync = () => {
    const L = scroller.current;
    const R = pins.current;
    if (!L || !R) return;
    const h = new Map<string, number>();
    L.querySelectorAll<HTMLElement>('tr[data-row]').forEach((tr) => h.set(tr.dataset.row!, tr.getBoundingClientRect().height));
    R.querySelectorAll<HTMLElement>('tr[data-row]').forEach((tr) => {
      const v = h.get(tr.dataset.row!);
      tr.style.height = v ? `${v}px` : '';
    });
    // The left box has a sideways bar under it; the right gets the same room so the two end together.
    R.style.paddingBottom = `${12 + (L.offsetHeight - L.clientHeight)}px`;
    follow(L, R);
  };
  useLayoutEffect(sync);
  useEffect(() => {
    const L = scroller.current;
    if (!L || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(L);
    if (L.firstElementChild) ro.observe(L.firstElementChild);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hover = (e: { target: EventTarget }) => {
    const row = (e.target as Element).closest?.('tr[data-row]') as HTMLElement | null;
    const id = row?.dataset.row ?? null;
    const box = scroller.current?.closest('.task-split');
    box?.querySelectorAll('tr.is-hover').forEach((tr) => tr.classList.remove('is-hover'));
    if (id) box?.querySelectorAll(`tr[data-row="${CSS.escape(id)}"].task-row`).forEach((tr) => tr.classList.add('is-hover'));
  };
  return (
    <div className="task-split" onMouseOver={hover} onMouseLeave={hover}>
      <div className="task-clip">
        <div className="task-scroll" ref={scroller} onScroll={() => follow(scroller.current, pins.current)}>
          {left}
        </div>
      </div>
      <div className="task-pins" ref={pins} onScroll={() => follow(pins.current, scroller.current)}>
        {right}
      </div>
    </div>
  );
}
