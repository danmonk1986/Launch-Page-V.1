import { useEffect, useState } from 'react';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock" aria-live="off">
      <time className="clock-time" dateTime={now.toISOString()}>
        {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </time>
      <span className="clock-date">
        {now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}
