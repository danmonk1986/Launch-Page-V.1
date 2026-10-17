import { useEffect, useRef, useState } from 'react';
import { nowBlockIndex, toBlocks, type Routine, type Shift } from '../lib/routines';

export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

type Props = { routine: Routine | null; shift: Shift; onEdit: () => void; /** Card by card mode: keep the step happening now in view. */ follow?: boolean };

/** The active routine as a timeline. Steps sit under their time block; now is highlighted. */
export function TodayPanel({ routine, shift, onEdit, follow }: Props) {
  const now = useNow();
  const blocks = routine ? toBlocks(routine, shift) : [];
  const current = nowBlockIndex(blocks, now);
  const nowBlock = current >= 0 ? blocks[current] : null;
  const panel = useRef<HTMLElement>(null);
  // Card by card: NOW stays on top and the list starts at what's next; earlier steps follow, dimmed.
  const order = follow && current >= 0 ? [...blocks.keys()].filter((i) => i > current).concat([...blocks.keys()].filter((i) => i < current)) : [...blocks.keys()];
  useEffect(() => {
    if (follow) panel.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [follow, current, routine?.id, shift]);

  return (
    <section ref={panel} className="panel panel-today" aria-label="Today's routine">
      {blocks.length === 0 ? (
        <div className="today-empty">
          <p className="panel-empty">No steps yet. Add them and they show here as today's timeline.</p>
          <button type="button" className="btn btn-quiet" onClick={onEdit}>
            Add steps
          </button>
        </div>
      ) : (
        <>
        {nowBlock && (
          <div className="now-card" aria-label="Right now">
            <span className="tl-time">{nowBlock.time ?? ''}</span>
            <span className="now-pill">NOW</span>
            <div className="tl-body">
              <span className="tl-label">{nowBlock.label}</span>
              {nowBlock.steps.length > 0 && <span className="tl-steps">{nowBlock.steps.join(' · ')}</span>}
            </div>
          </div>
        )}
        <ol className="timeline">
          {order.map((i, n) => {
            const b = blocks[i];
            const earlier = follow && current >= 0 && i < current;
            return (
            <li key={i} className={`tl-block${i === current ? ' is-now' : ''}${earlier ? ' is-earlier' : ''}${earlier && (n === 0 || order[n - 1] > current) ? ' is-first-earlier' : ''}`} aria-current={i === current ? 'time' : undefined}>
              <span className="tl-time">{b.time ?? ''}</span>
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-body">
                <span className="tl-label">
                  {b.label}
                  {i === current && <span className="tl-now">now</span>}
                </span>
                {b.steps.length > 0 && <span className="tl-steps">{b.steps.join(' · ')}</span>}
              </div>
            </li>
            );
          })}
        </ol>
        </>
      )}
    </section>
  );
}
