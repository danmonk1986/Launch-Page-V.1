import { useEffect, useState } from 'react';

/** Date line + live time, as in the DM26 Planner. The shift line is filled by the active routine (L2). */
export function DateLine({ shiftLine }: { shiftLine: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="dateline">
      <div className="dateline-top">
        <time className="dateline-date" dateTime={now.toISOString().slice(0, 10)}>
          {now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </time>
        <span className="dateline-time">
          {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      <p className="dateline-shift">{shiftLine}</p>
    </div>
  );
}
