import { Sheet } from './Sheet';
import type { Launch } from '../lib/rockets';
import { ackClash, hhmm12, mergedTitle, nextFree, type Clash } from '../lib/schedule';

/**
 * SCHEDULE GUARDRAILS (Dan, Nov 16): Overlaps another block. Shown by the launch form before it saves, and by the
 * app after any other save that lands a launch on top of another (a task's time, + Tomorrow, Skip, a push).
 * saved = the launch is already saved (the app's check): Keep both just closes.
 */
export function ClashSheet({
  clash,
  launches,
  saved,
  onSave,
  onDelete,
  onClose
}: {
  clash: { l: Launch; with: Clash[] } | null;
  launches: Launch[];
  saved?: boolean;
  onSave: (l: Launch) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onClose: (done: boolean) => void;
}) {
  const c = clash?.with[0];
  const free = clash && c ? nextFree(clash.l, c.day, launches) : null;
  const freeLabel = free ? hhmm12(Number(free.slice(0, 2)) * 60 + Number(free.slice(3))) : '';
  const canMerge = !!clash && !!c && clash.l.repeat === 'once' && c.launch.repeat === 'once' && clash.with.length === 1;
  const existing = !!clash && (saved || launches.some((x) => x.id === clash.l.id));
  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return (
    <Sheet open={!!clash} title="Overlaps another block" onClose={() => onClose(false)}>
      {clash && c && (
        <div className="clash">
          <p className="logask-q">
            <b>{clash.l.title}</b> overlaps:
          </p>
          <ul className="clash-list">
            {clash.with.map((x) => (
              <li key={x.launch.id}>
                <b>{x.launch.title}</b> · {hhmm12(x.start)}–{hhmm12(x.end)} · {fmtDay(x.day)}
              </li>
            ))}
          </ul>
          <div className="sheet-actions clash-acts">
            {free && (
              <button
                type="button"
                className="btn"
                title={`Move it to ${freeLabel} on ${fmtDay(c.day)}, the first open time after the clash`}
                onClick={async () => {
                  await onSave({ ...clash.l, atTime: free, onceTime: null });
                  onClose(true);
                }}
              >
                Next free time: {freeLabel}
              </button>
            )}
            {canMerge && (
              <button
                type="button"
                className="btn btn-quiet"
                title={`One block: ${c.launch.minutes + clash.l.minutes} min${existing ? '; this launch is removed' : ''}`}
                onClick={async () => {
                  await onSave({ ...c.launch, title: mergedTitle(c.launch.title, clash.l.title), minutes: c.launch.minutes + clash.l.minutes });
                  if (existing) await onDelete(clash.l.id);
                  onClose(true);
                }}
              >
                Add to that block{existing ? ' (removes this one)' : ''}
              </button>
            )}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={async () => {
                ackClash(clash.l);
                if (!saved) await onSave(clash.l);
                onClose(true);
              }}
            >
              Keep both
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
