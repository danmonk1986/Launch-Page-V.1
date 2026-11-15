import type { ReactNode } from 'react';

type Slots = { rockets: ReactNode; week: ReactNode; tasks: ReactNode; budget?: ReactNode; planner?: ReactNode; journal: ReactNode; today: ReactNode };

export function LaunchPageHome({ rockets, week, tasks, budget, planner, journal, today }: Slots) {
  return (
    <div className="home">
      <div className="home-main">
        {rockets}
        {week}
        {tasks}
        {budget}
        {planner}
        {journal}
      </div>
      {today}
    </div>
  );
}

const LATER: Record<string, { title: string; empty: string }> = {
  days26: { title: '26 Days', empty: 'Mode, Non-Negotiables, logging, baseline and bounce-back. Built after L4UNCH P4GE.' },
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
