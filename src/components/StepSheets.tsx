import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { taskName, type Task } from '../lib/tasks';

/** A step's own words (steps copy their task's description, so that part is left off). */
export const stepName = (s: Task) => s.task.trim() || taskName(s);

const short = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

function CheckList({ steps, picked, onToggle, todayIso }: { steps: Task[]; picked: Set<string>; onToggle: (id: string) => void; todayIso: string }) {
  return (
    <ul className="step-check-list">
      {steps.map((s) => (
        <li key={s.id}>
          <label className="step-check">
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => onToggle(s.id)} />
            <span className="step-check-name">{stepName(s)}</span>
            {s.endDate && <span className={`step-check-date${s.endDate < todayIso ? ' is-late' : ''}`}>{short(s.endDate)}</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}

function usePicked(key: string | null, initial: () => string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set(key ? initial() : [])), [key]);
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [picked, toggle] as const;
}

/**
 * V20-044 (Nov 9): Create launch on a task with steps. Pick the steps for this work block; they
 * all go into one timed launch. Steps due today or earlier start ticked.
 */
export function StepPicker({ task, steps, todayIso, onPick, onClose }: { task: Task | null; steps: Task[]; todayIso: string; onPick: (ids: string[]) => void; onClose: () => void }) {
  const [picked, toggle] = usePicked(task?.id ?? null, () => steps.filter((s) => s.endDate && s.endDate <= todayIso).map((s) => s.id));
  const n = picked.size;
  return (
    <Sheet open={!!task} title="Steps for this launch" onClose={onClose}>
      {task && (
        <div className="reminder">
          <p className="panel-empty">Tick the steps you'll work on in this block. They go into one timed launch; at Done you tick off what you finished.</p>
          <CheckList steps={steps} picked={picked} onToggle={toggle} todayIso={todayIso} />
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" title={`One launch for ${taskName(task)} itself`} onClick={() => onPick([])}>
              Just the task
            </button>
            <button type="button" className="btn" disabled={!n} onClick={() => onPick(steps.filter((s) => picked.has(s.id)).map((s) => s.id))}>
              Next · {n} step{n === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * V20-044: checking off a launch with more than one step asks what got finished. Ticked steps are
 * done; the rest stay open for the next block. Closing it leaves the launch as it was.
 */
export function StepCheckoff({ title, steps, todayIso, onConfirm, onClose }: { title: string | null; steps: Task[]; todayIso: string; onConfirm: (ids: string[]) => void; onClose: () => void }) {
  const [picked, toggle] = usePicked(title, () => []);
  const n = picked.size;
  return (
    <Sheet open={!!title} title={title ? `What did you finish? · ${title}` : 'What did you finish?'} onClose={onClose}>
      {title && (
        <div className="reminder">
          <p className="panel-empty">Tick what you got done. Anything left stays open and comes back in Due today.</p>
          <CheckList steps={steps} picked={picked} onToggle={toggle} todayIso={todayIso} />
          <div className="reminder-actions">
            <button type="button" className="btn btn-quiet" onClick={() => onConfirm([])}>
              None finished
            </button>
            <button type="button" className="btn" disabled={!n} onClick={() => onConfirm(steps.filter((s) => picked.has(s.id)).map((s) => s.id))}>
              Done ✓ {n} of {steps.length}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** The steps a launch covers, listed in its reminder. */
export function StepList({ steps }: { steps: Task[] }) {
  if (!steps.length) return null;
  return (
    <ul className="step-list">
      {steps.map((s) => (
        <li key={s.id}>{stepName(s)}</li>
      ))}
    </ul>
  );
}
