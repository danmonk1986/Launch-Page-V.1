import { Icon } from './Tasks';
import { money } from '../lib/budget';
import type { Expense } from '../lib/expenses';
import { fyOf, fyRange, tidy, type BankLine, type Draw } from '../lib/bank';
import { useHeaderSearch, matchesSearch } from '../lib/headerSearch';
import { useRef, useState, type ReactNode } from 'react';
import { MonthNav, TALLIES, TALLY_KEY, thisMonth, type Tally } from './Expenses';

/**
 * V20-453 (Dan, Nov 22): the Books home (beta Books track). Two cards beside the Budget card, laid out like it:
 * this month's total, then the latest few. ⌄ opens the full page (Records › Expenses / Income); + adds or imports.
 */
const CHEV = 'M6 9l6 6 6-6';
const PLUS = 'M12 5v14M5 12h14';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });
const isoDay = (d: Date) => `${iso(d)}-${String(d.getDate()).padStart(2, '0')}`;
const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * V20-466 (Dan, Nov 23): the Books cards show one week, like the Launch Page. This month: the week around today
 * (Last 7 days for what's happened, Next 7 days for what's due). Any other month: its first week (1st – 7th).
 */
export function booksWeek(month: string, ahead: boolean): { from: string; to: string; label: string } {
  const now = new Date();
  if (month === iso(now)) {
    const a = ahead ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 12);
    const b = ahead ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 12) : now;
    return { from: isoDay(a), to: isoDay(b), label: ahead ? 'Next 7 days' : 'Last 7 days' };
  }
  const first = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12);
  return { from: `${month}-01`, to: `${month}-07`, label: `${short(first)} – 7` };
}


/**
 * V20-536 (Dan, Nov 26): the cards are the overview. Their boxes match the pop-in pages' (the better ones), led by the
 * fiscal year's total: FY · the month (by …) · GST/HST · one box per group (tap one to show only its lines). Under
 * them, the latest 5 up to the end of the month (fewer if there are fewer).
 */
const LATEST = 5;
function fyOfMonth(m: string, fyEnd: string) {
  const fy = fyOf(`${m}-15`, fyEnd);
  return { fy, ...fyRange(fy, fyEnd) };
}
const monthEnd = (m: string) => `${m}-31`;
function readTally(): Tally {
  try {
    const v = localStorage.getItem(TALLY_KEY) as Tally | null;
    return v && TALLIES.some((t) => t.id === v) ? v : 'pmtCategory';
  } catch {
    return 'pmtCategory';
  }
}
function CardBoxes(p: { lead?: ReactNode; fyLabel: string; fyValue: number; monthLabel: string; monthValue: number; extra?: ReactNode; byKey: Record<string, number>; pick: string | null; onPick: (k: string | null) => void }) {
  return (
    <div className="budget-stats" aria-label="The year and the month">
      {p.lead}
      <div className="budget-stat budget-stat-fy">
        <span className="budget-stat-label">{p.fyLabel}</span>
        <span className="budget-stat-value">{money(p.fyValue)}</span>
      </div>
      <button type="button" className="budget-stat budget-stat-total" aria-pressed={p.pick === null} title="Show everything" onClick={() => p.onPick(null)}>
        <span className="budget-stat-label">{p.monthLabel}</span>
        <span className="budget-stat-value">{money(p.monthValue)}</span>
      </button>
      {p.extra}
      {Object.keys(p.byKey)
        .sort((a, b) => p.byKey[b] - p.byKey[a])
        .map((k) => (
          <button key={k} type="button" className="budget-stat" aria-pressed={p.pick === k} title={p.pick === k ? 'Show everything' : `Show only ${k}`} onClick={() => p.onPick(p.pick === k ? null : k)}>
            <span className="budget-stat-label">{k}</span>
            <span className="budget-stat-value">{money(p.byKey[k])}</span>
          </button>
        ))}
    </div>
  );
}
const sumBy = <T,>(rows: T[], key: (r: T) => string, amt: (r: T) => number) =>
  rows.reduce<Record<string, number>>((m, r) => {
    const k = key(r);
    m[k] = (m[k] ?? 0) + amt(r);
    return m;
  }, {});
const latestHead = (n: number, pick: string | null, total: number) => `Latest ${n}${pick ? ` · ${pick}` : ''} · ${money(total)}`;

function CardHead({ id, title, openLabel, onOpen, addLabel, onAdd }: { id: string; title: string; openLabel: string; onOpen: () => void; addLabel?: string; onAdd?: () => void }) {
  return (
    <div className="panel-head">
      <div className="rockets-title">
        <h2 id={id} className="panel-title">
          {title}
        </h2>
        <button type="button" className="rockets-toggle" aria-label={openLabel} title={openLabel} onClick={onOpen}>
          <Icon d={CHEV} />
        </button>
      </div>
      {onAdd && (
        <div className="panel-actions">
          <button type="button" className="icon-btn tool-btn" aria-label={addLabel} title={addLabel} onClick={onAdd}>
            <Icon d={PLUS} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ExpensesCard({ expenses, today, onOpenAll, onAdd, projects = [], fyEnd = '09-30' }: { expenses: Expense[]; today: Date; onOpenAll: () => void; onAdd?: () => void; projects?: { name: string; color: string }[]; fyEnd?: string }) {
  const { q } = useHeaderSearch();
  const m = iso(today);
  const fy = fyOfMonth(m, fyEnd);
  const fyTotal = expenses.filter((e) => e.date >= fy.from && e.date <= fy.to).reduce((a, e) => a + (e.amount ?? 0), 0);
  const month = expenses.filter((e) => e.date.slice(0, 7) === m);
  const total = month.reduce((a, e) => a + (e.amount ?? 0), 0);
  const gst = month.reduce((a, e) => a + (e.gst ?? 0), 0);
  // The same grouping as the Expenses page (its square button; remembered on this device).
  const [tally, setTallyState] = useState<Tally>(readTally);
  const [pick, setPick] = useState<string | null>(null);
  const ti = TALLIES.findIndex((t) => t.id === tally);
  const next = TALLIES[(ti + 1) % TALLIES.length];
  const setTally = (t: Tally) => {
    setTallyState(t);
    setPick(null);
    try {
      localStorage.setItem(TALLY_KEY, t);
    } catch {
      /* ignore */
    }
  };
  const keyOf = (e: Expense) => e[tally].trim().toUpperCase() || 'OTHER';
  const byKey = sumBy(month, keyOf, (e) => e.amount ?? 0);
  const latest = expenses
    .filter((e) => e.date <= monthEnd(m) && (!pick || (e.date.slice(0, 7) === m && keyOf(e) === pick)))
    .filter((e) => matchesSearch(q, e.description, e.category, e.project, e.notes))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sort - a.sort))
    .slice(0, LATEST);
  const wkTotal = latest.reduce((a, e) => a + (e.amount ?? 0), 0);
  return (
    <section className="panel panel-budget-card panel-books-card" aria-labelledby="h-expenses-card">
      <CardHead id="h-expenses-card" title="Expenses" openLabel="Open all Expenses" onOpen={onOpenAll} addLabel="Add an expense" onAdd={onAdd} />
      <CardBoxes
        lead={
          <button type="button" className="icon-btn tool-btn budget-groupby" aria-label={`Totals by ${TALLIES[ti].label}. Switch to ${next.label}`} title={`By ${TALLIES[ti].label} · tap for ${next.label}`} onClick={() => setTally(next.id)}>
            <Icon d={TALLIES[ti].icon} />
          </button>
        }
        fyLabel={`FY${fy.fy} · spent`}
        fyValue={fyTotal}
        monthLabel={`${monthName(today)} · by ${TALLIES[ti].label}`}
        monthValue={total}
        extra={
          gst > 0 ? (
            <div className="budget-stat">
              <span className="budget-stat-label">GST/HST</span>
              <span className="budget-stat-value">{money(gst)}</span>
            </div>
          ) : null
        }
        byKey={byKey}
        pick={pick}
        onPick={setPick}
      />
      <h3 className="card-h">{latestHead(latest.length, pick, wkTotal)}</h3>
      {latest.length === 0 ? (
        <p className="field-hint">{expenses.length ? 'No expenses up to this month.' : 'No expenses yet. Tap + to add one, or ⌄ to import a bank statement.'}</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Latest expenses">
          {/* V20-527 (Dan, Nov 25): more columns on the Books cards (desktop); phones keep two lines. */}
          {/* V20-542 (Dan, Nov 26): the cards take the pop-in pages' style: their column order, the same-width
              division pill, Type as a pill, the middle columns centred. */}
          <div className="bc-row bc-head books-wide bw-exp" role="row">
            <span role="columnheader" className="c-div">Division</span>
            <span role="columnheader" className="c-date">Date</span>
            <span role="columnheader" className="c-name">Description</span>
            <span role="columnheader" className="c-meth">Method</span>
            <span role="columnheader" className="c-x">Type</span>
            <span role="columnheader" className="c-x">Group</span>
            <span role="columnheader" className="c-x">Category</span>
            <span role="columnheader" className="c-amt bc-amt">Total</span>
            <span role="columnheader" className="c-x bc-amt">GST/HST</span>
          </div>
          {latest.map((e, i) => (
            <button type="button" key={e.id} className={`bc-row bc-row-btn books-wide bw-exp${i % 2 ? ' is-alt' : ''}`} role="row" title="Open Expenses" onClick={onOpenAll}>
              <span className="c-div pl-desc bc-proj"><DivChip name={e.project} projects={projects} /></span>
              <span className="c-date pl-mono pl-due">{day(e.date)}</span>
              <span className="c-name pl-name bc-name">{e.description || '—'}</span>
              <span className="c-meth pl-desc">{e.method || '—'}</span>
              <span className="c-x pl-desc">{e.type ? <span className={`status${e.type === 'FIXED' ? ' status-three' : ''}`}>{e.type}</span> : '—'}</span>
              <span className="c-x pl-desc">{e.category || '—'}</span>
              <span className="c-x pl-desc">{e.pmtCategory || '—'}</span>
              <span className="c-amt pl-mono bc-amt">{e.amount === null ? '—' : money(e.amount)}</span>
              <span className="c-x pl-mono bc-amt">{e.gst ? money(e.gst) : '—'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** V20-528 (Dan, Nov 25): divisions show as pills in their project colour, like the Budget card. */
function DivChip({ name, projects = [] }: { name: string; projects?: { name: string; color: string }[] }) {
  if (!name) return <>—</>;
  const n = (v: string) => v.trim().toUpperCase().replace(/^STARDVST\s+/, '');
  const pr = projects.find((x) => n(x.name) === n(name)) ?? projects.find((x) => n(x.name).startsWith(n(name)) || n(name).startsWith(n(x.name)));
  return (
    <span className="chip" style={pr ? { ['--chip' as string]: pr.color } : undefined} title={name}>
      {pr ? pr.name.replace(/^STARDVST\s+/i, '') : name}
    </span>
  );
}

export function IncomeCard({ lines, today, onOpenAll, onImport, accounts = [], projects = [], fyEnd = '09-30' }: { projects?: { name: string; color: string }[]; lines: BankLine[]; today: Date; onOpenAll: () => void; onImport?: () => void; /** V20-527: account short names (ATB B.) in place of numbers. */ accounts?: { number: string; method: string; name: string }[]; fyEnd?: string }) {
  const acctName = (n: string) => {
    const a = accounts.find((x) => x.number === n);
    return a?.method || a?.name || (n.length > 4 ? `••${n.slice(-4)}` : n);
  };
  const { q } = useHeaderSearch();
  const m = iso(today);
  const fy = fyOfMonth(m, fyEnd);
  const ins = lines
    .filter((l) => l.route === 'income' || l.route === 'interest')
    .map((l) => ({ l, amount: l.credit ?? -(l.debit ?? 0), what: l.income?.description || (l.route === 'interest' ? 'Interest' : tidy(l.key)) }));
  const fyTotal = ins.filter((x) => x.l.date >= fy.from && x.l.date <= fy.to).reduce((a, x) => a + x.amount, 0);
  const month = ins.filter((x) => x.l.date.slice(0, 7) === m);
  const total = month.reduce((a, x) => a + x.amount, 0);
  const [pick, setPick] = useState<string | null>(null);
  const keyOf = (x: (typeof ins)[number]) => (x.l.route === 'interest' && !x.l.income?.project ? 'INTEREST' : (x.l.income?.project ?? '').trim().toUpperCase() || 'OTHER');
  const byKey = sumBy(month, keyOf, (x) => x.amount);
  const latest = ins
    .filter((x) => x.l.date <= monthEnd(m) && (!pick || (x.l.date.slice(0, 7) === m && keyOf(x) === pick)))
    .filter((x) => matchesSearch(q, x.what, x.l.text))
    .sort((a, b) => (a.l.date < b.l.date ? 1 : a.l.date > b.l.date ? -1 : 0))
    .slice(0, LATEST);
  const wkTotal = latest.reduce((a, x) => a + x.amount, 0);
  return (
    <section className="panel panel-budget-card panel-books-card" aria-labelledby="h-income-card">
      <CardHead id="h-income-card" title="Income" openLabel="Open all Income" onOpen={onOpenAll} addLabel="Import a bank statement" onAdd={onImport} />
      <CardBoxes fyLabel={`FY${fy.fy} · in`} fyValue={fyTotal} monthLabel={`${monthName(today)} · in`} monthValue={total} byKey={byKey} pick={pick} onPick={setPick} />
      <h3 className="card-h">{latestHead(latest.length, pick, wkTotal)}</h3>
      {latest.length === 0 ? (
        <p className="field-hint">{ins.length ? 'No money in up to this month.' : 'No income yet. Money in comes from your bank statements: tap + to import one.'}</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Latest income">
          <div className="bc-row bc-head books-wide bw-inc" role="row">
            <span role="columnheader" className="c-date">Date</span>
            <span role="columnheader" className="c-div">Division</span>
            <span role="columnheader" className="c-name">Description</span>
            <span role="columnheader" className="c-x">Kind</span>
            <span role="columnheader" className="c-meth">Account</span>
            <span role="columnheader" className="c-amt bc-amt">Amount</span>
            <span role="columnheader" className="c-x bc-amt">GST</span>
          </div>
          {latest.map((x, i) => (
            <button type="button" key={x.l.id} className={`bc-row bc-row-btn books-wide bw-inc${i % 2 ? ' is-alt' : ''}`} role="row" title="Open Income" onClick={onOpenAll}>
              <span className="c-date pl-mono pl-due">{day(x.l.date)}</span>
              <span className="c-div pl-desc bc-proj"><DivChip name={x.l.income?.project ?? ''} projects={projects} /></span>
              <span className="c-name pl-name bc-name">{x.what}</span>
              <span className="c-x pl-desc">{x.l.route === 'interest' ? 'Interest' : 'Income'}</span>
              <span className="c-meth pl-desc">{acctName(x.l.account)}</span>
              <span className="c-amt pl-mono bc-amt">{money(x.amount)}</span>
              <span className="c-x pl-mono bc-amt">{x.l.income?.gst ? money(x.l.income.gst) : '—'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** V20-523 (Dan, Nov 24): Draws get a home on the Books track: money you took out of the business, like Income's card. */
export function DrawsCard({ draws, today, onOpenAll, onImport, projects = [], fyEnd = '09-30' }: { draws: Draw[]; today: Date; onOpenAll: () => void; onImport?: () => void; projects?: { name: string; color: string }[]; fyEnd?: string }) {
  const { q } = useHeaderSearch();
  const m = iso(today);
  const fy = fyOfMonth(m, fyEnd);
  const fyTotal = draws.filter((d) => d.date >= fy.from && d.date <= fy.to).reduce((a, d) => a + d.amount, 0);
  const month = draws.filter((d) => d.date.slice(0, 7) === m);
  const total = month.reduce((a, d) => a + d.amount, 0);
  const [pick, setPick] = useState<string | null>(null);
  const keyOf = (d: Draw) => d.project.trim().toUpperCase() || 'OTHER';
  const byKey = sumBy(month, keyOf, (d) => d.amount);
  const latest = draws
    .filter((d) => d.date <= monthEnd(m) && (!pick || (d.date.slice(0, 7) === m && keyOf(d) === pick)))
    .filter((d) => matchesSearch(q, d.description, d.project, d.notes))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sort - a.sort))
    .slice(0, LATEST);
  const wkTotal = latest.reduce((a, d) => a + d.amount, 0);
  return (
    <section className="panel panel-budget-card panel-books-card" aria-labelledby="h-draws-card">
      <CardHead id="h-draws-card" title="Draws" openLabel="Open all Draws" onOpen={onOpenAll} addLabel="Import a bank statement" onAdd={onImport} />
      <CardBoxes fyLabel={`FY${fy.fy} · drawn`} fyValue={fyTotal} monthLabel={`${monthName(today)} · drawn`} monthValue={total} byKey={byKey} pick={pick} onPick={setPick} />
      <h3 className="card-h">{latestHead(latest.length, pick, wkTotal)}</h3>
      {latest.length === 0 ? (
        <p className="field-hint">{draws.length ? 'No draws up to this month.' : 'No draws yet. Money you take out of the business (a transfer or e-transfer to you) comes from your bank statements.'}</p>
      ) : (
        <div className="bc-table" role="table" aria-label="Latest draws">
          <div className="bc-row bc-head books-wide bw-drw" role="row">
            <span role="columnheader" className="c-div">Division</span>
            <span role="columnheader" className="c-date">Date</span>
            <span role="columnheader" className="c-name">Description</span>
            <span role="columnheader" className="c-amt bc-amt">Transferred</span>
            <span role="columnheader" className="c-x c-note">Notes</span>
          </div>
          {latest.map((d, i) => (
            <button type="button" key={d.id} className={`bc-row bc-row-btn books-wide bw-drw${i % 2 ? ' is-alt' : ''}`} role="row" title="Open Draws" onClick={onOpenAll}>
              <span className="c-div pl-desc bc-proj"><DivChip name={d.project} projects={projects} /></span>
              <span className="c-date pl-mono pl-due">{day(d.date)}</span>
              <span className="c-name pl-name bc-name">{d.description || '—'}</span>
              <span className="c-amt pl-mono bc-amt">{money(d.amount)}</span>
              <span className="c-x c-note pl-desc">{d.notes || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * V20-455 (Dan, Nov 22): the CASH BOOK, top of the Books home, laid out like the Stats summary.
 * Opening + In − Out = Closing for a month. In = money in from the bank imports (the Income card); Out = Expenses.
 * The opening balance is set once, for the month the cash book starts; each later month opens with the month
 * before's closing balance (carried forward, like a paper cash book).
 */
const shiftM = (m: string, n: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const mLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export function CashBookCard({ expenses, lines, cashBook, month: shown, onMonth, onSetOpening, onDownloadBlank, onImportFile, onImportBank, onExport, onSetup, onInvoice }: { expenses: Expense[]; lines: BankLine[]; cashBook?: { start: string; opening: number }; month?: string; onMonth?: (m: string) => void; onSetOpening: (start: string, opening: number) => void; onDownloadBlank?: () => void; onImportFile?: (f: File) => void; onImportBank?: () => void; onExport?: () => void; /** V20-474: one button, "Set up your books". */ onSetup?: () => void; /** V20-537 (Main): Create an invoice beside it. */ onInvoice?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  // V20-464 (Dan, Nov 22): the month can be held by the Books home, so ‹ › moves the whole overview.
  const [own, setOwn] = useState(thisMonth);
  const month = shown ?? own;
  const setMonth = onMonth ?? setOwn;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inOf = (m: string) => lines.filter((l) => (l.route === 'income' || l.route === 'interest') && l.date.slice(0, 7) === m).reduce((a, l) => a + (l.credit ?? -(l.debit ?? 0)), 0);
  const outOf = (m: string) => expenses.filter((e) => e.date.slice(0, 7) === m).reduce((a, e) => a + (e.amount ?? 0), 0);
  const moneyIn = inOf(month);
  const moneyOut = outOf(month);
  let opening: number | null = null;
  if (cashBook && month >= cashBook.start) {
    opening = cashBook.opening;
    for (let m = cashBook.start; m < month; m = shiftM(m, 1)) opening += inOf(m) - outOf(m);
  }
  const closing = opening === null ? null : opening + moneyIn - moneyOut;
  const carried = !!cashBook && month > cashBook.start;
  const save = () => {
    const n = Number(draft.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n)) return;
    onSetOpening(month, Math.round(n * 100) / 100);
    setEditing(false);
  };
  const card = (label: string, value: string, sub: string, hero = false) => (
    <div className={`pd-card${hero ? ' st-hero' : ''}`}>
      <span className="pd-label">{label}</span>
      <span className="pd-num">{value}</span>
      <span className="pd-sub">{sub}</span>
    </div>
  );
  return (
    <section className="panel panel-cashbook" aria-labelledby="h-cashbook">
      <div className="panel-head">
        <h2 id="h-cashbook" className="panel-title">
          Cash Book
        </h2>
        {/* V20-462 (Dan, Nov 22): laid out like the Expenses page: month beside the title, import / export icons on the right. */}
        <MonthNav month={month} onChange={setMonth} />
        <div className="panel-actions">
          {onImportFile && (
            <button type="button" className="icon-btn tool-btn" aria-label="Import your Launch Sheet" title="Import your Launch Sheet (.xlsx or one tab as .csv)" onClick={() => fileRef.current?.click()}>
              <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </button>
          )}
          {onExport && (
            <button type="button" className="icon-btn tool-btn" aria-label="Export your Launch Sheet" title="Export your Launch Sheet (every tab, opens in Sheets, Excel or Numbers)" onClick={onExport}>
              <Icon d="M12 21V9M7 14l5-5 5 5M5 3h14" />
            </button>
          )}
        </div>
      </div>
      {onImportFile && (
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onImportFile(f);
          }}
        />
      )}
      <div className="pd-cards cashbook-cards">
        {card('Opening', opening === null ? '—' : money(opening), opening === null ? (cashBook ? `starts ${mLabel(cashBook.start)}` : 'not set yet') : carried ? `carried from ${mLabel(shiftM(month, -1))}` : 'set by you')}
        {card('In', `+ ${money(moneyIn)}`, 'money in from your bank')}
        {card('Out', `− ${money(moneyOut)}`, 'your expenses')}
        {card('Closing', closing === null ? '—' : money(closing), closing === null ? 'set an opening balance' : closing < 0 ? 'below zero' : 'what\'s left', true)}
      </div>
      {/* V20-475 (Dan, Nov 23): with "Set up your books", the opening balance is set there (step 1), not here. */}
      {onSetup ? null : editing ? (
        <form
          className="cashbook-set"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <span>Opening balance for {mLabel(month)}</span>
            <input inputMode="decimal" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. 2,450.00" />
          </label>
          <button type="submit" className="btn">
            Save
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <p className="field-hint cashbook-hint">
          {cashBook ? `Your cash book starts ${mLabel(cashBook.start)}.` : 'Set what you had on the first day of a month, and every month after carries on from it.'}{' '}
          <button
            type="button"
            className="link-btn cashbook-link"
            onClick={() => {
              setDraft(opening !== null && !carried ? String(opening) : '');
              setEditing(true);
            }}
          >
            {!cashBook ? `Set the opening balance for ${mLabel(month)}` : month === cashBook.start ? 'Change the opening balance' : `Start it at ${mLabel(month)} instead`}
          </button>
        </p>
      )}
      {/* V20-458 / 459 / 461 (Dan, Nov 22): start from your own data: the blank Launch Sheet (paste each sheet you keep
          into its tab) or a bank statement .CSV. Exporting is for later, not setup. */}
      {/* V20-474 (Dan, Nov 23): setting up without an import goes smoother: one button, a blank version of the import. */}
      {onSetup ? (
        <div className="cashbook-start">
          <h3 className="card-h">Set up your books</h3>
          <p className="field-hint">Start with your opening balance, then add your expenses and deposits one line at a time. Descriptions you use are remembered, so each month gets quicker. Have a bank .CSV? You can import it from there too.</p>
          <div className="budget-empty-acts">
            <button type="button" className="btn btn-go" onClick={onSetup}>
              Set up your books
            </button>
            {onInvoice && (
              <button type="button" className="btn btn-quiet" onClick={onInvoice}>
                Create an invoice
              </button>
            )}
          </div>
        </div>
      ) : (onDownloadBlank || onImportFile || onImportBank) && (
        <div className="cashbook-start">
          <h3 className="card-h">Get started from your own data</h3>
          <p className="field-hint">
            Start from the sheets you already keep: download the blank Launch Sheet, paste each one into its tab (expenses into EXPENSES, deposits into INCOME…), then import it. Or import a bank statement saved as .CSV. Anything already here is skipped.
          </p>
          <div className="budget-empty-acts">
            {onDownloadBlank && (
              <button type="button" className="btn btn-quiet" onClick={onDownloadBlank}>
                Download the blank Launch Sheet
              </button>
            )}
            {onImportFile && (
              <>
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  Import your Launch Sheet
                </button>
              </>
            )}
            {onImportBank && (
              <button type="button" className="btn btn-quiet" onClick={onImportBank}>
                Import a bank .CSV
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
