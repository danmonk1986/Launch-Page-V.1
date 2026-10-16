import { useEffect, useState } from 'react';
import { nowBlockIndex, toBlocks, type Routine, type Shift } from '../lib/routines';

export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

type Props = { routine: Routine | null; shift: Shift; onEdit: () => void };

/** The active routine as a timeline. Steps sit under their time block; now is highlighted. */
export function TodayPanel({ routine, shift, onEdit }: Props) {
  const now = useNow();
  const blocks = routine ? toBlocks(routine, shift) : [];
  const current = nowBlockIndex(blocks, now);
  const nowBlock = current >= 0 ? blocks[current] : null;

  return (
    <section className="panel panel-today" aria-label="Today's routine">
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
            <span className="tl-dot" aria-hidden="true" />
            <div className="tl-body">
              <span className="tl-label">
                {nowBlock.label}
                <span className="tl-now">now</span>
              </span>
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
