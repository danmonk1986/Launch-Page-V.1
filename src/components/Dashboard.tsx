type Panel = { id: string; title: string; empty: string; step: string; wide?: boolean };

// Order follows the build plan. Each panel fills in when its step lands.
const PANELS: Panel[] = [
  {
    id: 'today',
    title: 'Today',
    empty: 'Mode (HQ or MWD), Non-Negotiables and quick logs will live here.',
    step: 'Step 2',
    wide: true
  },
  {
    id: 'routines',
    title: 'Routines & Rituals',
    empty: 'Your timed Routines and untimed Rituals, flipped for Days or Nights.',
    step: 'Step 3'
  },
  {
    id: 'todo',
    title: 'To-Do',
    empty: 'Due today, 3 key tasks and in progress.',
    step: 'Step 4'
  },
  {
    id: 'calendar',
    title: 'Calendar',
    empty: 'Your calendar, synced both ways with Google Calendar.',
    step: 'Step 4'
  },
  {
    id: 'journal',
    title: 'Journal',
    empty: 'One headline for the day.',
    step: 'later in Module 1'
  },
  {
    id: 'launcher',
    title: 'Launcher',
    empty: 'Timed task flows: a reminder, then one tap opens every tab you need.',
    step: 'later in Module 1'
  }
];

export function Dashboard() {
  return (
    <main className="board" aria-label="Dashboard">
      {PANELS.map((p) => (
        <section key={p.id} className={`panel${p.wide ? ' panel-wide' : ''}`} aria-labelledby={`h-${p.id}`}>
          <h2 id={`h-${p.id}`} className="panel-title">
            {p.title}
          </h2>
          <p className="panel-empty">{p.empty}</p>
          <p className="panel-step">{p.step.startsWith('Step') ? `Arrives in ${p.step}` : `Arrives ${p.step}`}</p>
        </section>
      ))}
    </main>
  );
}
