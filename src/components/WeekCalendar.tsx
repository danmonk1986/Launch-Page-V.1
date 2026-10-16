import { useState } from 'react';
import { Sheet } from './Sheet';
import { addDays, layoutWeek, weekStart, type CalEvent, type EventColor } from '../lib/events';
import { isoDate } from '../lib/launchers';

type Props = {
  events: CalEvent[];
  onSave: (e: CalEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const COLORS: EventColor[] = ['teal', 'purple', 'blue'];

/** Sunday to Saturday. Multi-day events span their days; click a day to add, an event to edit. */
export function WeekCalendar({ events, onSave, onDelete }: Props) {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const today = isoDate(new Date());
  const start = addDays(weekStart(new Date()), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const placed = layoutWeek(events, start);
  const lanes = placed.reduce((m, p) => Math.max(m, p.lane + 1), 0);
  const end = days[6];
  const range = `${start.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${end.toLocaleDateString('en-CA', {
    month: start.getMonth() === end.getMonth() ? undefined : 'long',
    day: 'numeric'
  })}`;

  return (
    <section className="panel panel-week" aria-labelledby="h-week">
      <div className="panel-head">
        <div>
          <h2 id="h-week" className="panel-title">
            {offset === 0 ? 'This week' : 'Week of'}
          </h2>
          <p className="panel-sub">{range}</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
            ‹
          </button>
          {offset !== 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setOffset(0)}>
              Today
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
            ›
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setEditing(null);
              setNewDate(offset === 0 ? today : isoDate(start));
              setOpen(true);
            }}
          >
            + Add event
          </button>
        </div>
      </div>

      <div className="week-scroll">
        <div className="week-grid" style={{ gridTemplateRows: `auto repeat(${Math.max(lanes, 1)}, 32px)` }}>
          {days.map((d, i) => {
            const iso = isoDate(d);
            return (
              <button
                key={iso}
                type="button"
                className={`week-day${iso === today ? ' is-today' : ''}`}
                style={{ gridColumn: i + 1, gridRow: 1 }}
                aria-label={`Add an event on ${d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}`}
                onClick={() => {
                  setEditing(null);
                  setNewDate(iso);
                  setOpen(true);
                }}
              >
                <span className="week-dow">{d.toLocaleDateString('en-CA', { weekday: 'short' })}</span>
                <span className="week-num">{d.getDate()}</span>
              </button>
            );
          })}
          {placed.map(({ event, lane, from, to }) => (
            <button
              key={event.id}
              type="button"
              className={`week-event ev-${event.color}`}
              style={{ gridColumn: `${from} / ${to + 1}`, gridRow: lane + 2 }}
              onClick={() => {
                setEditing(event);
                setOpen(true);
              }}
            >
              {event.title}
            </button>
          ))}
        </div>
        {placed.length === 0 && <p className="panel-empty week-empty">Nothing this week yet. Tap a day to add an event.</p>}
      </div>

      <Sheet open={open} title={editing ? `Edit ${editing.title}` : 'Add event'} onClose={() => setOpen(false)}>
        <EventForm
          event={editing}
          date={newDate ?? today}
          onCancel={() => setOpen(false)}
          onSave={async (e) => {
            await onSave(e);
            setOpen(false);
          }}
          onDelete={async (id) => {
            await onDelete(id);
            setOpen(false);
          }}
        />
      </Sheet>
    </section>
  );
}

function EventForm({
  event,
  date,
  onCancel,
  onSave,
  onDelete
}: {
  event: CalEvent | null;
  date: string;
  onCancel: () => void;
  onSave: (e: CalEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState<CalEvent>(
    () => event ?? { id: crypto.randomUUID(), title: '', startDate: date, endDate: date, color: 'teal', sort: 0 }
  );
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!d.title.trim()) return;
        const endDate = d.endDate < d.startDate ? d.startDate : d.endDate;
        await onSave({ ...d, title: d.title.trim(), endDate });
      }}
    >
      <label className="field">
        <span>Event</span>
        <input required value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Pay mid-month bills" />
      </label>
      <div className="time-grid">
        <label className="field">
          <span>Starts</span>
          <input
            type="date"
            required
            value={d.startDate}
            onChange={(e) => {
              const v = e.target.value;
              setD((x) => ({ ...x, startDate: v, endDate: x.endDate < v ? v : x.endDate }));
            }}
          />
        </label>
        <label className="field">
          <span>Ends</span>
          <input type="date" required min={d.startDate} value={d.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </label>
      </div>
      <fieldset className="field">
        <legend>Colour</legend>
        <div className="choice-row">
          {COLORS.map((c) => (
            <label key={c} className="choice">
              <input type="radio" name="event-color" checked={d.color === c} onChange={() => set('color', c)} />
              <span className={`swatch-dot ev-${c}`} aria-hidden="true" />
              <span>{c === 'teal' ? 'Teal' : c === 'purple' ? 'Purple' : 'Blue'}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sheet-actions sheet-actions-split">
        {event ? (
          <button
            type="button"
            className="btn btn-quiet btn-danger"
            aria-label={`Delete ${event.title}`}
            onClick={() => onDelete(event.id)}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!d.title.trim()}>
            Save event
          </button>
        </div>
      </div>
    </form>
  );
}
