import { Sheet } from './Sheet';
import { formatMinutes, toMinutes } from '../lib/routines';
import { describeOpens, timeFor, type Launch } from '../lib/launchers';

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
          <p className="reminder-time">{formatMinutes(toMinutes(timeFor(launch, new Date())))} · Launch time</p>
          <p className="panel-empty">
            {launch.ritualId
              ? `Opens your ritual${launch.urls.length ? ` and ${describeOpens(launch.urls)}` : ''}. Time allotted: ${launch.minutes} minutes.`
              : launch.urls.length
                ? `Opens ${describeOpens(launch.urls)}. Time allotted: ${launch.minutes} minutes.`
                : 'Nothing to open yet. Edit this timed launch to add tabs or apps.'}
          </p>
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" title="Skip today: back tomorrow, same time" onClick={() => onSkip(launch)}>
              Skip
            </button>
            <button type="button" className="btn btn-quiet" title="Snooze 10 minutes" onClick={() => onSnooze(launch)}>
              Snooze
            </button>
            <button type="button" className="btn" disabled={!launch.urls.length && !launch.ritualId} title={launch.ritualId ? 'Open the ritual' : `Open ${describeOpens(launch.urls)}`} onClick={() => onLaunch(launch)}>
              Launch
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

type TimeUpProps = {
  launch: Launch | null;
  onDone: (l: Launch) => void;
  onMore: (l: Launch) => void;
  onTomorrow: (l: Launch) => void;
};

/** The end alarm: the time allotted for a launched launch has run out. */
export function TimeUpReminder({ launch, onDone, onMore, onTomorrow }: TimeUpProps) {
  return (
    <Sheet open={!!launch} title={launch ? `Time's up: ${launch.title}` : "Time's up"} onClose={() => launch && onMore(launch)}>
      {launch && (
        <div className="reminder">
          <p className="reminder-time">
            {formatMinutes((toMinutes(timeFor(launch, new Date())) + launch.minutes) % 1440)} · {launch.minutes} minutes are up
          </p>
          <p className="panel-empty">Did you finish? Check it off, take 10 more minutes, or move it to tomorrow.</p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={() => onTomorrow(launch)}>
              Move to tomorrow
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => onMore(launch)}>
              +10 min
            </button>
            <button type="button" className="btn" onClick={() => onDone(launch)}>
              Done ✓
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
