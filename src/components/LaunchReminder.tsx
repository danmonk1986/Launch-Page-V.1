import { Sheet } from './Sheet';
import { formatMinutes, toMinutes } from '../lib/routines';
import { describeLog, describeOpens, opensSomething, timeFor, type Launch } from '../lib/launchers';

type Props = {
  launch: Launch | null;
  onLaunch: (l: Launch) => void;
  onSnooze: (l: Launch) => void;
  onSkip: (l: Launch) => void;
  /** Nothing to open: LOG (or Done) logs it and checks it off. */
  onDone: (l: Launch) => void;
};

/** The reminder that pops up at a timed launch. Launching from here is a tap, so the browser allows the tabs. */
export function LaunchReminder({ launch, onLaunch, onSnooze, onSkip, onDone }: Props) {
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
                : launch.logKind
                  ? `Logs ${describeLog(launch)}.`
                  : 'A reminder: nothing to open or log.'}
          </p>
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" title={launch.repeat === 'hourly' ? 'Skip this hour' : 'Skip today: back tomorrow, same time'} onClick={() => onSkip(launch)}>
              Skip
            </button>
            <button type="button" className="btn btn-quiet" title="Snooze 10 minutes" onClick={() => onSnooze(launch)}>
              Snooze
            </button>
            {opensSomething(launch) ? (
              <button type="button" className="btn" title={launch.ritualId ? 'Open the ritual' : `Open ${describeOpens(launch.urls)}`} onClick={() => onLaunch(launch)}>
                Launch
              </button>
            ) : (
              <button type="button" className="btn" title={launch.logKind ? `Log ${describeLog(launch)} and check it off` : 'Check it off'} onClick={() => onDone(launch)}>
                {launch.logKind ? 'Log' : 'Done'}
              </button>
            )}
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

type MissedProps = {
  /** Missed and due-now launches, by time. Empty = closed. */
  launches: Launch[];
  onLaunch: (l: Launch) => void;
  onDone: (l: Launch) => void;
  onSkip: (l: Launch) => void;
  /** Close: they stay in Active; this pop-up won't come back for them today. */
  onClose: () => void;
};

/** Everything missed while the app was closed, in one pop-up instead of one at a time (Oct 21). */
export function MissedLaunches({ launches, onLaunch, onDone, onSkip, onClose }: MissedProps) {
  const now = new Date();
  return (
    <Sheet open={launches.length > 0} title={`Missed · ${launches.length}`} onClose={onClose}>
      <div className="reminder">
        <p className="panel-empty">While you were away. Launch, check off or skip each one; close to leave them in Active.</p>
        <ul className="missed-list">
          {launches.map((l) => (
            <li key={l.id} className="missed-row">
              <span className="timed-time">{formatMinutes(toMinutes(timeFor(l, now)))}</span>
              <span className="missed-title">{l.title}</span>
              <span className="missed-actions">
                {opensSomething(l) && (
                  <button type="button" className="btn btn-quiet" title={l.ritualId ? 'Open the ritual' : `Open ${describeOpens(l.urls)}`} onClick={() => onLaunch(l)}>
                    Launch
                  </button>
                )}
                <button type="button" className="btn btn-quiet" title={l.logKind ? `Log ${describeLog(l)} and check it off` : 'Check it off'} onClick={() => onDone(l)}>
                  {l.logKind ? 'Log' : 'Done'}
                </button>
                <button type="button" className="btn btn-quiet" title={l.repeat === 'once' ? 'Move to tomorrow, same time' : 'Skip today'} onClick={() => onSkip(l)}>
                  Skip
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="reminder-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}
