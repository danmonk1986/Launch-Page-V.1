/**
 * ⚙ Export my data → the LAUNCH SHEET (V12-042, Nov 1): every card's data in one workbook, one tab
 * per card, each topped with the brand (logo text, headline, mantra) so a user's own branding
 * replaces L4UNCH!P4GE. Opens in Google Sheets with every tab. A user's data is theirs: nothing is
 * trimmed or retired until it can be exported.
 */
import { buildXlsx, type Cell, type SheetSpec } from './xlsx';
import type { BrandSettings } from './settings';
import type { Routine } from './routines';
import type { Meditation } from './meditations';
import { describeLog, describeOpens, type Launch, type LaunchLog, type Launcher } from './launchers';
import type { CalEvent } from './events';
import type { Task } from './tasks';
import type { Project } from './projects';
import { checkinsOf, type JournalEntry } from './journal';
import { isDone, scoreDay, type Config, type DayRecord, type LogEntry, type NonNeg, type Quote } from './days26';
import type { BudgetLine } from './budget';
import type { Expense } from './expenses';
import { invoiceTotals, type Customer, type Invoice } from './invoices';
import { describeRepeat, readRepeat } from './repeat';

export interface ExportData {
  settings: BrandSettings;
  routines: Routine[];
  meditations: Meditation[];
  launchers: Launcher[];
  launches: Launch[];
  launchLog: LaunchLog[];
  events: CalEvent[];
  googleEvents: CalEvent[];
  tasks: Task[];
  projects: Project[];
  journal: JournalEntry[];
  days: DayRecord[];
  nonnegs: NonNeg[];
  logs: LogEntry[];
  quotes: Quote[];
  config: Config;
  budget: BudgetLine[];
  expenses: Expense[];
  invoices: Invoice[];
  customers: Customer[];
}

const yes = (b: unknown) => (b ? 'Yes' : '');
const rep = (raw: string | null | undefined) => {
  const r = readRepeat(raw);
  return r.kind === 'none' ? '' : describeRepeat(r);
};
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

export function launchSheet(d: ExportData): { blob: Blob; name: string; counts: { tab: string; rows: number }[] } {
  const brand = d.settings.logoUrl ? d.settings.logoText || 'L4UNCH!P4GE' : 'L4UNCH!P4GE';
  const exported = new Date();
  const top = (card: string): SheetSpec['top'] => [
    { text: `${brand} · ${card}`, style: 'title' },
    { text: d.settings.goal || '', style: 'motto' },
    { text: d.settings.mantra || '', style: 'mantra' }
  ];
  const project = (id: string | null) => {
    const p = d.projects.find((x) => x.id === id);
    if (!p) return '';
    const parent = p.parentId ? d.projects.find((x) => x.id === p.parentId) : null;
    return parent ? `${parent.name} › ${p.name}` : p.name;
  };
  const routineName = (id: string | null | undefined) => d.routines.find((r) => r.id === id)?.name ?? '';

  const tabs: SheetSpec[] = [];
  const add = (name: string, headers: string[], rows: Cell[][], widths?: number[]) => tabs.push({ name, top: top(name), headers, rows, widths });

  // ROUTINES and RITUALS: one row per step.
  const steps = (kind: 'routine' | 'ritual') =>
    d.routines
      .filter((r) => (r.kind ?? 'routine') === kind)
      .sort((a, b) => a.sort - b.sort)
      .flatMap((r) =>
        (r.items.length ? r.items : [{ time: null, label: '' }]).map((it, i) => [
          r.name,
          kind === 'routine' ? (r.flips ? 'Days / Nights' : 'Days') : r.shiftStart ?? '',
          kind === 'routine' ? r.wake ?? '' : '',
          kind === 'routine' ? r.bed ?? '' : '',
          i + 1,
          it.time ?? '',
          it.label,
          (it as { type?: string }).type ?? (kind === 'ritual' ? 'step' : ''),
          (it as { text?: string }).text ?? (it as { options?: string[] }).options?.join(', ') ?? ''
        ])
      );
  add('ROUTINES', ['Routine', 'Shift', 'Wake', 'Bed', 'Step #', 'Time', 'Step', 'Type', 'Details'], steps('routine'));

  add(
    'ROCKETS',
    ['Name', 'Note', 'Link', 'Colour', 'Routines', 'Hidden'],
    [...d.launchers].sort((a, b) => a.sort - b.sort).map((l) => [l.name, l.note, l.url, l.color, l.routineIds ? l.routineIds.map(routineName).join(', ') : 'Every routine', yes(l.hidden)])
  );

  add(
    'TIMED LAUNCHES',
    ['Title', 'Time', 'Repeat', 'Weekdays', 'Day of month', 'Date', 'More dates', 'Minutes', 'Opens', 'Logs', 'Ritual', 'On', 'Sound'],
    [...d.launches]
      .sort((a, b) => a.atTime.localeCompare(b.atTime))
      .map((l) => [
        l.title,
        l.atTime,
        l.repeat,
        l.repeat === 'weekly' ? l.weekdays.map((w) => 'SMTWTFS'[w]).join(' ') : '',
        l.monthDay ?? '',
        l.onDate ?? '',
        (l.moreDates ?? []).join(', '),
        l.minutes,
        describeOpens(l.urls),
        describeLog(l),
        routineName(l.ritualId),
        yes(l.active),
        yes(l.sound)
      ])
  );

  add(
    'LAUNCH LOG',
    ['Day', 'Launch', 'Outcome', 'Planned min', 'Extra min', 'Started', 'Finished', 'Minutes spent'],
    [...d.launchLog]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((g) => {
        const spent = g.launchedAt && g.finishedAt ? Math.round((new Date(g.finishedAt).getTime() - new Date(g.launchedAt).getTime()) / 60_000) : '';
        return [g.day, g.title, g.outcome, g.planned, g.extra, when(g.launchedAt), when(g.finishedAt), spent];
      })
  );

  add(
    'THIS WEEK',
    ['Start', 'End', 'Event', 'Calendar', 'From'],
    [...d.events.map((e) => ({ e, from: 'LaunchPage' })), ...d.googleEvents.map((e) => ({ e, from: 'Google' }))]
      .sort((a, b) => a.e.startDate.localeCompare(b.e.startDate))
      .map(({ e, from }) => [e.startDate, e.endDate, e.title, e.google?.calendar ?? '', from])
  );

  // TASKS: steps under their task.
  const tops = d.tasks.filter((t) => !t.parentId).sort((a, b) => a.sort - b.sort);
  const taskRow = (t: Task, step: boolean): Cell[] => [
    project(t.projectId),
    step ? '' : t.task,
    step ? `↳ ${t.task}` : t.description,
    t.status,
    t.startDate ?? '',
    t.endDate ?? '',
    t.atTime ?? '',
    rep(t.repeatRule),
    t.linkLabel,
    t.link,
    t.expense,
    t.notes,
    t.budgetLineId ? 'Yes' : '',
    t.done ? 'Done' : '',
    when(t.doneAt),
    t.deletedAt ? `Deleted ${when(t.deletedAt)}` : ''
  ];
  add(
    'TASKS',
    ['Project', 'Task', 'Description / Step', 'Status', 'Start', 'Required', 'Time', 'Repeat', 'Link name', 'Info link', 'Expense', 'Notes', 'In Budget', 'Done', 'Done at', 'Deleted'],
    tops.flatMap((t) => [taskRow(t, false), ...d.tasks.filter((s) => s.parentId === t.id).sort((a, b) => a.sort - b.sort).map((s) => taskRow(s, true))])
  );

  add(
    'JOURNAL',
    ['Date', 'Headline', 'Theme', 'Mood', 'Check-in #', 'At', 'Check-in'],
    [...d.journal]
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((j) => {
        const cs = checkinsOf(j);
        return cs.length ? cs.map((c, i) => [j.date, i === 0 ? j.headline : '', i === 0 ? j.theme : '', i === 0 ? j.mood ?? '' : '', i + 1, when(c.at), c.text]) : [[j.date, j.headline, j.theme, j.mood ?? '', '', '', '']];
      })
  );

  add(
    '26 DAYS',
    ['Day', 'Mode', 'Shift', 'Off day', 'Ticked', 'Out of', 'On baseline', 'All ticked', 'Productivity blocks', 'Activity min', 'Vice load', 'Missed'],
    [...d.days]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r) => {
        const s = scoreDay(r, d.logs, d.config);
        const missed = r.off ? '' : r.items.filter((it) => !isDone(it, r, d.logs, r.day)).map((it) => it.label).join(', ');
        return [r.day, r.mode, r.shift, yes(r.off), r.off ? '' : s.done, r.off ? '' : s.total, r.off ? '' : yes(s.on), r.off ? '' : yes(s.full), s.blocks, s.activity, s.vice, missed];
      })
  );

  add(
    'NON-NEGOTIABLES',
    ['#', 'Non-negotiable', 'Section', 'Time', 'Logs', 'Target', 'Per week', 'Removed'],
    [...d.nonnegs].sort((a, b) => a.sort - b.sort).map((n, i) => [i + 1, n.label, n.section, n.timeFrom ? `= ${n.timeFrom}` : n.time ?? '', n.log ?? '', n.target || '', n.perWeek ?? '', yes(n.archived)])
  );

  add(
    'LOGS',
    ['Day', 'At', 'Kind', 'Amount', 'Unit', 'Qty', 'Note', 'Mode'],
    [...d.logs].sort((a, b) => a.at.localeCompare(b.at)).map((l) => [l.day, when(l.at), l.kind, l.amount, l.unit, l.qty, l.note, l.mode])
  );

  add('RITUALS', ['Ritual', 'Starts', '', '', 'Step #', 'Time', 'Step', 'Type', 'Details'], steps('ritual'));

  add('MEDITATIONS', ['Title', 'Script'], [...d.meditations].sort((a, b) => a.sort - b.sort).map((m) => [m.title, m.script]), [28, 100]);

  add('QUOTES', ['Quote', 'Author'], [...d.quotes].sort((a, b) => a.sort - b.sort).map((q) => [q.text, q.author]));

  add(
    'BUDGET',
    ['Section', 'Project', 'Date', 'Repeat', 'Line item', 'Pmt method', 'Pmt type', 'Budget group', 'Payment category', 'Amount (CAD)', 'Original price', 'Link name', 'Info link', 'Notes', 'Linked task'],
    [...d.budget]
      .sort((a, b) => a.section.localeCompare(b.section) || a.sort - b.sort)
      .map((l) => [
        l.section,
        l.project,
        l.date ?? '',
        rep(l.repeat),
        l.description,
        l.method,
        l.type,
        l.category,
        l.pmtCategory,
        l.amount,
        l.currency && l.foreign != null ? `${l.foreign} ${l.currency}` : '',
        l.linkLabel ?? '',
        l.link ?? '',
        l.notes,
        yes(d.tasks.some((t) => t.budgetLineId === l.id && !t.deletedAt))
      ])
  );

  add(
    'EXPENSES',
    ['Date', 'Division', 'Description', 'Method', 'Pmt type', 'Budget group', 'Payment category', 'Total (CAD)', 'Original price', 'GST', 'Notes', 'From budget'],
    [...d.expenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [e.date, e.project, e.description, e.method, e.type, e.category, e.pmtCategory, e.amount, e.currency && e.foreign != null ? `${e.foreign} ${e.currency}` : '', e.gst, e.notes, yes(e.budgetLineId)])
  );

  add(
    'INVOICES',
    ['Number', 'Customer', 'Start', 'End', 'Job ID', 'Operator', 'Well', 'Description', 'Day rate', 'Subtotal', 'GST', 'Total', 'Paid', 'Notes'],
    [...d.invoices]
      .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))
      .map((i) => {
        const t = invoiceTotals(i);
        return [i.number, d.customers.find((c) => c.id === i.customerId)?.name ?? '', i.start ?? '', i.end ?? '', i.jobId, i.operator, i.well, i.description, i.dayRate, t.total, t.gst, t.subTotal, i.datePaid ?? '', i.notes];
      })
  );

  // The cover first: what's in the sheet.
  const counts = tabs.map((t) => ({ tab: t.name, rows: t.rows.length }));
  tabs.unshift({
    name: 'LAUNCH SHEET',
    top: [
      { text: brand, style: 'title' },
      { text: d.settings.goal || '', style: 'motto' },
      { text: d.settings.mantra || '', style: 'mantra' },
      { text: `Exported ${when(exported.toISOString())} · ${d.settings.displayName || ''}`.trim(), style: 'note' }
    ],
    headers: ['Tab', 'Rows'],
    rows: counts.map((c) => [c.tab, c.rows]),
    widths: [24, 10]
  });

  const stamp = `${exported.getFullYear()}-${String(exported.getMonth() + 1).padStart(2, '0')}-${String(exported.getDate()).padStart(2, '0')}`;
  const safe = brand.replace(/[^A-Za-z0-9!_-]+/g, '-').replace(/^-|-$/g, '') || 'LAUNCH-SHEET';
  return { blob: buildXlsx(tabs, { purple: d.settings.accentPurple || '#8869cb', teal: d.settings.accentTeal || '#06f9c2' }), name: `${safe}-LAUNCH-SHEET-${stamp}.xlsx`, counts };
}

/** Downloads the Launch Sheet. */
export function downloadLaunchSheet(d: ExportData) {
  const { blob, name, counts } = launchSheet(d);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return counts;
}
