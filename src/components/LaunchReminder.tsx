import { Sheet } from './Sheet';
import { formatMinutes, toMinutes } from '../lib/routines';
import type { Launch } from '../lib/launchers';

type Props = {
  launch: Launch | null;
  onLaunch: (l: Launch) => void;
  onSnooze: (l: Launch) => void;
  onSkip: (l: Launch) => void;
};

/** The reminder that pops up at a timed launch. Launching from here is a tap, so the browser allows the tabs. */
export function LaunchReminder({ launch, onLaunch, onSnooze, onSkip }: Props) {
  return (
    <Sheet open={!!launch} title={launch ? launch.title : 'Launch'} onClose={() => launch && onSnooze(launch)}>
      {launch && (
        <div className="reminder">
          <p className="reminder-time">{formatMinutes(toMinutes(launch.atTime))} · Launch time</p>
          <p className="panel-empty">
            {launch.urls.length
              ? `Opens ${launch.urls.length} ${launch.urls.length === 1 ? 'tab' : 'tabs'}. Time allotted: ${launch.minutes} minutes.`
              : 'No tabs added yet. Edit this timed launch to add them.'}
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={() => onSkip(launch)}>
              Skip today
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => onSnooze(launch)}>
              Snooze 10 min
            </button>
            <button type="button" className="btn" disabled={!launch.urls.length} onClick={() => onLaunch(launch)}>
              Launch {launch.urls.length} {launch.urls.length === 1 ? 'tab' : 'tabs'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
