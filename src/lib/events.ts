import { makeStore } from './store';
import { isoDate } from './launchers';

export type EventColor = 'teal' | 'purple' | 'blue';

export interface CalEvent {
  id: string;
  title: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD", same as start for one day
  color: EventColor;
  sort: number;
  /** Set on events that live in Google Calendar (kept in gcal_events, not the events table). */
  google?: {
    id: string;
    calendarId: string;
    calendar: string | null;
    color: string | null;
    readOnly: boolean;
    link: string | null;
    time: string | null;
  };
}

type Row = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  color: EventColor;
  sort: number;
};

export const eventStore = makeStore<CalEvent, Row>({
  table: 'events',
  localKey: 'launchpage.events.v1',
  orderBy: 'start_date',
  script: 'supabase/migrations/0003_launchers_events.sql',
  seed: () => [],
  toRow: (e) => ({ id: e.id, title: e.title, start_date: e.startDate, end_date: e.endDate, color: e.color, sort: e.sort }),
  fromRow: (r) => ({ id: r.id, title: r.title, startDate: r.start_date, endDate: r.end_date, color: r.color, sort: r.sort })
});

/** Sunday of the week holding `d`, at local noon (safe across daylight-saving changes). */
export function weekStart(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export interface Placed {
  event: CalEvent;
  lane: number;
  from: number; // 1–7 grid column
  to: number; // 1–7, inclusive
}

/** Events overlapping the week, packed into lanes so spans never collide. */
export function layoutWeek(events: CalEvent[], start: Date): Placed[] {
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i)));
  const first = days[0];
  const last = days[6];
  const inWeek = events
    .filter((e) => e.endDate >= first && e.startDate <= last)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate));
  const lanes: number[] = []; // last column used in each lane
  return inWeek.map((event) => {
    const from = event.startDate < first ? 1 : days.indexOf(event.startDate) + 1;
    const to = event.endDate > last ? 7 : days.indexOf(event.endDate) + 1;
    let lane = lanes.findIndex((end) => end < from);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(to);
    } else {
      lanes[lane] = to;
    }
    return { event, lane, from, to };
  });
}
