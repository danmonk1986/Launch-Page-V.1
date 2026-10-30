import { useEffect, useState } from 'react';

/** Compact date and live time for the header, under the routine picker. */
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="header-clock">
      <time dateTime={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`}>
        {now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </time>
      <span className="header-time">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    </p>
  );
}
