import type { ReactNode } from 'react';

type Panel = { id: string; title: string; empty: string; piece: string };

// Launch Page layout from the approved mockup. Each panel fills in with its build piece.
const LEFT: Panel[] = [
  { id: 'launchers', title: 'Launchers', empty: 'Your launch tiles for the active routine. Launch all opens every tab from a reminder.', piece: 'L3' },
  { id: 'week', title: 'This week', empty: 'Sunday to Saturday, synced both ways with Google Calendar.', piece: 'L5' },
  { id: 'tasks', title: 'Tasks', empty: 'Due today and your 3 key tasks: project, description, task, status, link, start, end, time.', piece: 'L4' },
  { id: 'journal', title: 'Journal', empty: 'One headline for the day.', piece: 'L6' }
];

function PanelCard({ p }: { p: Panel }) {
  return (
    <section className={`panel panel-${p.id}`} aria-labelledby={`h-${p.id}`}>
      <h2 id={`h-${p.id}`} className="panel-title">
        {p.title}
      </h2>
      <p className="panel-empty">{p.empty}</p>
      <p className="panel-step">Arrives in build piece {p.piece}</p>
    </section>
  );
}

export function LaunchPageHome({ today }: { today: ReactNode }) {
  return (
    <div className="home">
      <div className="home-main">
        {LEFT.map((p) => (
          <PanelCard key={p.id} p={p} />
        ))}
      </div>
      {today}
    </div>
  );
}

const LATER: Record<string, { title: string; empty: string }> = {
  days26: { title: '26 Days', empty: 'Mode, Non-Negotiables, logging, baseline and bounce-back. Built after the Launch Page.' },
  summary: { title: 'Summary', empty: 'Hit rate, vice load and HQ vs MWD, with a plain-words takeaway.' },
  planner: { title: 'Planner', empty: 'The bigger plan: weeks and months ahead.' }
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
