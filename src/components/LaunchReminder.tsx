import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { TitleCombo, joinTitle, splitTitle } from './Launchers';
import { launchListFor } from '../lib/hiddenPicks';
import { formatMinutes, toMinutes } from '../lib/routines';
import { describeLog, describeOpens, opensSomething, runsOnClock, timeFor, type Launch } from '../lib/launchers';

type Props = {
  launch: Launch | null;
  onLaunch: (l: Launch) => void;
  /** Oct 24: snooze for this many minutes; a changed description saves to the launch. */
  onSnooze: (l: Launch, minutes: number, title?: string) => void;
  /** Oct 25: Edit in the snooze choices: snoozes 10 and opens Edit timed launch. */
  onEdit?: (l: Launch, title?: string) => void;
  /** Every launch's title, for the description list. */
  titles?: string[];
  onSkip: (l: Launch) => void;
  /** Nothing to open: LOG (or Done) logs it and checks it off. */
  onDone: (l: Launch) => void;
};

/** The reminder that pops up at a timed launch. Launching from here is a tap, so the browser allows the tabs. */
export function LaunchReminder({ launch, onLaunch, onSnooze, onSkip, onDone, onEdit, titles = [] }: Props) {
  // Oct 24: Snooze opens its own choices (+10 / +30 / +60) with the description to add to.
  const [snoozing, setSnoozing] = useState(false);
  const [desc, setDesc] = useState('');
  useEffect(() => {
    setSnoozing(false);
    setDesc(launch ? splitTitle(launch.title).desc : '');
  }, [launch?.id]);
  const cat = launch ? splitTitle(launch.title).cat : '';
  const descriptions = [...new Set(titles.map(splitTitle).filter((t) => launchListFor(t.cat) === launchListFor(cat) && t.desc).map((t) => t.desc))].sort((a, b) => a.localeCompare(b));
  const snooze = (min: number) => {
    if (!launch) return;
    const title = joinTitle(cat, desc);
    onSnooze(launch, min, title !== launch.title ? title : undefined);
  };
  return (
    <Sheet open={!!launch} title={launch ? (snoozing ? `Snooze · ${cat}` : launch.title) : 'Launch'} onClose={() => launch && onSnooze(launch, 10)}>
      {launch && snoozing && (
        <div className="reminder">
          <div className="field">
            <span>Description · add to it or change it</span>
            <TitleCombo value={desc} titles={descriptions} required={false} autoFocus placeholder="Launch Page Construction" onChange={setDesc} list={launchListFor(cat)} />
          </div>
          <div className="reminder-actions snooze-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setSnoozing(false)}>
              Back
            </button>
            {[10, 30].map((m) => (
              <button key={m} type="button" className="btn" onClick={() => snooze(m)}>
                +{m} min
              </button>
            ))}
            {/* Oct 25: Edit in place of +60: change the time, rockets or anything else. */}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                const title = joinTitle(cat, desc);
                onEdit ? onEdit(launch, title !== launch.title ? title : undefined) : snooze(60);
              }}
            >
              Edit
            </button>
          </div>
        </div>
      )}
      {launch && !snoozing && (
        <div className="reminder">
          <p className="reminder-time">{formatMinutes(toMinutes(timeFor(launch, new Date())))} · Launch time</p>
          <p className="panel-empty">
            {launch.ritualId
              ? `Opens your ritual${launch.urls.length ? ` and ${describeOpens(launch.urls)}` : ''}. Time allotted: ${launch.minutes} minutes.`
              : launch.urls.length
                ? `Opens ${describeOpens(launch.urls)}. Time allotted: ${launch.minutes} minutes.`
                : runsOnClock(launch)
                  ? `Start the clock: ${launch.minutes} minutes, then Time's up. Logs ${describeLog(launch)}.`
                  : launch.logKind
                  ? `Logs ${describeLog(launch)}.`
                  : 'A reminder: nothing to open or log.'}
          </p>
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" title={launch.repeat === 'hourly' ? 'Skip this hour' : 'Skip today: back tomorrow, same time'} onClick={() => onSkip(launch)}>
              Skip
            </button>
            <button type="button" className="btn btn-quiet" title="Snooze: pick how long" onClick={() => setSnoozing(true)}>
              Snooze
            </button>
            {opensSomething(launch) ? (
              <button type="button" className="btn" title={launch.ritualId ? 'Open the ritual' : `Open ${describeOpens(launch.urls)}`} onClick={() => onLaunch(launch)}>
                Launch
              </button>
            ) : runsOnClock(launch) ? (
              <button type="button" className="btn" title={`Start the clock: ${launch.minutes} minutes`} onClick={() => onLaunch(launch)}>
                Start
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
  /** Oct 24: more time, like Snooze at the start: +10 / +30 / +60 and the description. */
  onMore: (l: Launch, minutes: number, title?: string) => void;
  onTomorrow: (l: Launch) => void;
  titles?: string[];
};

/** The end alarm: the time allotted for a launched launch has run out. */
export function TimeUpReminder({ launch, onDone, onMore, onTomorrow, titles = [] }: TimeUpProps) {
  const [more, setMore] = useState(false);
  const [desc, setDesc] = useState('');
  useEffect(() => {
    setMore(false);
    setDesc(launch ? splitTitle(launch.title).desc : '');
  }, [launch?.id]);
  const cat = launch ? splitTitle(launch.title).cat : '';
  const descriptions = [...new Set(titles.map(splitTitle).filter((t) => launchListFor(t.cat) === launchListFor(cat) && t.desc).map((t) => t.desc))].sort((a, b) => a.localeCompare(b));
  const addTime = (min: number) => {
    if (!launch) return;
    const title = joinTitle(cat, desc);
    onMore(launch, min, title !== launch.title ? title : undefined);
  };
  return (
    <Sheet open={!!launch} title={launch ? (more ? `More time · ${cat}` : `Time's up: ${launch.title}`) : "Time's up"} onClose={() => launch && onMore(launch, 10)}>
      {launch && more && (
        <div className="reminder">
          <div className="field">
            <span>Description · add to it or change it</span>
            <TitleCombo value={desc} titles={descriptions} required={false} autoFocus placeholder="Launch Page Construction" onChange={setDesc} list={launchListFor(cat)} />
          </div>
          <div className="reminder-actions snooze-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setMore(false)}>
              Back
            </button>
            {[10, 30, 60].map((m) => (
              <button key={m} type="button" className="btn" onClick={() => addTime(m)}>
                +{m} min
              </button>
            ))}
          </div>
        </div>
      )}
      {launch && !more && (
        <div className="reminder">
          <p className="reminder-time">
            {formatMinutes((toMinutes(timeFor(launch, new Date())) + launch.minutes) % 1440)} · {launch.minutes} minutes are up
          </p>
          <p className="panel-empty">Did you finish? Check it off, take more time, or move it to tomorrow.</p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={() => onTomorrow(launch)}>
              Move to tomorrow
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setMore(true)}>
              More time
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
                {runsOnClock(l) && (
                  <button type="button" className="btn btn-quiet" title={opensSomething(l) ? (l.ritualId ? 'Open the ritual' : `Open ${describeOpens(l.urls)}`) : 'Start the clock'} onClick={() => onLaunch(l)}>
                    {opensSomething(l) ? 'Launch' : 'Start'}
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
