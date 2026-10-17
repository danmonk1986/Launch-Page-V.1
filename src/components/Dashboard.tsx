import type { ReactNode } from 'react';

type Slots = { launchers: ReactNode; week: ReactNode; tasks: ReactNode; journal: ReactNode; today: ReactNode };

export function LaunchPageHome({ launchers, week, tasks, journal, today }: Slots) {
  return (
    <div className="home">
      <div className="home-main">
        {launchers}
        {week}
        {tasks}
        {journal}
      </div>
      {today}
    </div>
  );
}

const LATER: Record<string, { title: string; empty: string }> = {
  days26: { title: '26 Days', empty: 'Mode, Non-Negotiables, logging, baseline and bounce-back. Built after the Launch Page.' },
  budget: { title: 'Budget', empty: 'Money in, money out and what’s left, alongside your expense tasks. Coming soon.' }
};

export function ComingSoon({ page }: { page: string }) {
  const p = LATER[page];
  if (!p) return null;
  return (
    <section className="panel panel-soon" aria-labelledby="h-soon">
      <h2 id="h-soon" className="panel-title">
        {p.title}
      </h2>
      <p className="panel-empty">{p.empty}</p>
    </section>
  );
}
