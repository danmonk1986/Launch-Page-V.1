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
  // Follow the time: scroll the routine so the step happening now sits near the top.
  useEffect(() => {
    const el = panel.current;
    if (!follow || !el) return;
    const row = el.querySelector<HTMLElement>('.tl-block.is-now');
    if (!row) return;
    const card = el.querySelector<HTMLElement>('.now-card');
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - (card?.offsetHeight ?? 0) - 24;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
          {blocks.map((b, i) => (
            <li key={i} className={`tl-block${i === current ? ' is-now' : ''}`} aria-current={i === current ? 'time' : undefined}>
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
          ))}
        </ol>
        </>
      )}
    </section>
  );
}
