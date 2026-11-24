import { useEffect, useMemo, useState } from 'react';
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

export function StatementCheck(p: { lines: BankLine[]; expenses: Expense[]; accounts: BankAccount[]; onImport: (r: ImportResult) => Promise<void>; onShow?: (expenseId: string, date: string) => void; open: boolean; onClose: () => void; onCount?: (n: number) => void }) {
  const [kept, setKept] = useState<string[]>(readKept);
  const [busy, setBusy] = useState(false);
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
      // V20-503: a statement line split into parts (4 insurance policies in one $421.17 charge): a part of the same
      // amount is the charge. Already its own expense → Counted twice.
      const split = bank
        ? null
        : p.lines.find((b) => isBank(b) && b.account === s.account && days(b.date, s.date) <= 4 && (b.parts ?? []).some((x) => Math.abs(x.amount - amt(s)) < 0.005));
      const part = split?.parts?.find((x) => Math.abs(x.amount - amt(s)) < 0.005);
      if (split && part) {
        if (part.expenseId && part.expenseId !== s.expenseId) out.push({ sheet: s, expense, bank: split, why: 'double' });
        continue;
      }
      if (!bank) out.push({ sheet: s, expense, bank, why: 'gone' });
      else if (bank.route === 'expense' && bank.expenseId && bank.expenseId !== s.expenseId) out.push({ sheet: s, expense, bank, why: 'double' });
      else if (bank.route === 'personal') out.push({ sheet: s, expense, bank, why: 'personal' });
    }
    return out.sort((x, y) => x.sheet.date.localeCompare(y.sheet.date));
  }, [p.lines, p.expenses, kept]);

  // V20-505 (Dan, Nov 24): the Audit button in the Expenses header opens this card and shows its count.
  useEffect(() => p.onCount?.(issues.length), [issues.length]);
  if (!p.open) return null;
  if (!issues.length)
    return (
      <div className="statement-check">
        <div className="statement-check-head">
          <h3 className="card-h">Audit · all clear</h3>
          <button type="button" className="btn btn-quiet" onClick={p.onClose}>
            Hide
          </button>
        </div>
        <p className="field-hint">Everything from your spreadsheets is backed up by your bank statements.</p>
      </div>
    );
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
          Audit · not on your statement · {issues.length} · {money(total)}
        </h3>
        <button type="button" className="btn btn-quiet" onClick={p.onClose}>
          Hide
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void accept(issues)}>
          {busy ? 'Fixing…' : `Fix all ${issues.length}`}
        </button>
      </div>
      <p className="field-hint">These came from a spreadsheet you imported, but your bank statement for those dates doesn't back them up. Click one to see it below. The bin fixes it (removes the spreadsheet copy); the tick says it's right, so it stays in Expenses and drops off this list.</p>
      {(
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
              {/* V20-504 (Dan): card-size icons: the bin fixes it (removes the spreadsheet copy), the tick keeps it as it is. */}
              <span className="bc-lost-acts statement-check-acts">
                <button type="button" className="quick-btn statement-bin" disabled={busy} onClick={() => void accept([i])} aria-label={`${WHY[i.why].fix}: ${i.expense?.description ?? ''}`} title={`${WHY[i.why].fix} (fix it)`}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
                <button type="button" className="quick-btn quick-done" onClick={() => keep(i)} aria-label={`Keep ${i.expense?.description ?? ''} as it is`} title="It's right: keep it in Expenses and stop asking">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
