import { useMemo, useState } from 'react';
import { money } from '../lib/budget';
import type { BankAccount, BankLine } from '../lib/bank';
import type { Expense } from '../lib/expenses';
import type { ImportResult } from './BankImport';

/**
 * V20-494 (Dan, Nov 23, Books): the statement check. A spreadsheet line (Launch Sheet / Records file, fp 'sheet|…')
 * for an expense, on an account whose bank statement you've imported and inside that statement's dates, should match
 * a charge on the statement. Three ways it doesn't:
 * - Not charged: no charge for that amount within 4 days (e.g. a budget bill ticked as paid that never went through).
 * - Counted twice: the statement line already made its own expense.
 * - Statement says Personal: the statement line was filed Personal; the spreadsheet filed it as an expense.
 * Nothing dated after yesterday is asked about (the statement may not reach it yet). Accept fixes it; Keep leaves it.
 */
type Issue = { sheet: BankLine; expense: Expense | null; bank: BankLine | null; why: 'gone' | 'double' | 'personal' };
const KEPT = 'launchpage.statementKept.v1';
const readKept = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEPT) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const WHY: Record<Issue['why'], { label: string; fix: string }> = {
  gone: { label: 'Not charged', fix: 'Remove it' },
  double: { label: 'Counted twice', fix: 'Remove the copy' },
  personal: { label: 'Statement says Personal', fix: 'Use this filing' }
};

export function StatementCheck(p: { lines: BankLine[]; expenses: Expense[]; accounts: BankAccount[]; onImport: (r: ImportResult) => Promise<void>; onShow?: (expenseId: string, date: string) => void }) {
  const [kept, setKept] = useState<string[]>(readKept);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const issues = useMemo<Issue[]>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toLocaleDateString('en-CA');
    const isBank = (l: BankLine) => !l.fp.startsWith('sheet|') && !l.fp.startsWith('manual:');
    const span = new Map<string, { a: string; z: string }>();
    for (const l of p.lines.filter(isBank)) {
      const s = span.get(l.account);
      span.set(l.account, { a: !s || l.date < s.a ? l.date : s.a, z: !s || l.date > s.z ? l.date : s.z });
    }
    const amt = (l: BankLine) => l.debit ?? -(l.credit ?? 0);
    const days = (x: string, y: string) => Math.abs(new Date(`${x}T12:00`).getTime() - new Date(`${y}T12:00`).getTime()) / 86_400_000;
    const out: Issue[] = [];
    for (const s of p.lines) {
      if (!s.fp.startsWith('sheet|') || s.route !== 'expense' || kept.includes(s.fp) || s.date > yesterday) continue;
      const cover = span.get(s.account);
      if (!cover || s.date < cover.a || s.date > cover.z) continue;
      const bank = p.lines.find((b) => isBank(b) && b.account === s.account && Math.abs(amt(b) - amt(s)) < 0.005 && days(b.date, s.date) <= 4) ?? null;
      const expense = p.expenses.find((e) => e.id === s.expenseId) ?? null;
      if (!bank) out.push({ sheet: s, expense, bank, why: 'gone' });
      else if (bank.route === 'expense' && bank.expenseId && bank.expenseId !== s.expenseId) out.push({ sheet: s, expense, bank, why: 'double' });
      else if (bank.route === 'personal') out.push({ sheet: s, expense, bank, why: 'personal' });
    }
    return out.sort((x, y) => x.sheet.date.localeCompare(y.sheet.date));
  }, [p.lines, p.expenses, kept]);

  if (!issues.length) return null;
  const acct = (n: string) => p.accounts.find((a) => a.number === n)?.method || n;
  const empty: ImportResult = { accounts: [], lines: [], expenses: [], draws: [], common: [], invoices: [], profile: null, update: true };
  const accept = async (list: Issue[]) => {
    setBusy(true);
    const lines: BankLine[] = [];
    const removeExpenses: string[] = [];
    const removeLines: string[] = [];
    for (const i of list) {
      removeLines.push(i.sheet.id);
      if (i.why === 'personal' && i.bank && i.expense) {
        // The statement line takes the spreadsheet's filing (its expense), so the charge counts once, as an expense.
        lines.push({ ...i.bank, route: 'expense', expenseId: i.expense.id });
      } else if (i.expense) removeExpenses.push(i.expense.id);
    }
    await p.onImport({ ...empty, lines, removeExpenses, removeLines });
    setBusy(false);
  };
  const keep = (i: Issue) => {
    const next = [...kept, i.sheet.fp];
    setKept(next);
    try {
      localStorage.setItem(KEPT, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const total = issues.reduce((a, i) => a + (i.expense?.amount ?? i.sheet.debit ?? 0), 0);
  return (
    <div className="statement-check">
      <div className="statement-check-head">
        <h3 className="card-h">
          Not on your statement · {issues.length} · {money(total)}
        </h3>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen((x) => !x)}>
          {open ? 'Hide' : 'Review'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void accept(issues)}>
          {busy ? 'Fixing…' : `Accept all ${issues.length}`}
        </button>
      </div>
      <p className="field-hint">These came from a spreadsheet you imported, but your bank statement for those dates doesn't back them up. Accept fixes each one; Keep leaves it as it is.</p>
      {open && (
        <div className="statement-check-list">
          {issues.map((i) => (
            <div key={i.sheet.id} className="statement-check-row">
              <span className="col-date">{new Date(`${i.sheet.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="bank-mono">{acct(i.sheet.account)}</span>
              {/* V20-502 (Dan): clicking an item takes you to it in the Expenses list below. */}
              {i.expense && p.onShow ? (
                <button type="button" className="link-btn pl-desc statement-check-go" title="Show it in the list below" onClick={() => p.onShow!(i.expense!.id, i.expense!.date)}>
                  {i.expense.description || i.sheet.text || '—'}
                </button>
              ) : (
                <span className="pl-desc">{i.expense?.description || i.sheet.text || '—'}</span>
              )}
              <span className="pl-mono">{money(i.expense?.amount ?? i.sheet.debit ?? 0)}</span>
              <span className="statement-check-why">{WHY[i.why].label}</span>
              <span className="bc-lost-acts">
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void accept([i])} title={WHY[i.why].fix}>
                  Accept
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => keep(i)} title="It's right as it is: stop asking">
                  Keep
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
