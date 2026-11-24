import type { BudgetLine } from './budget';
import type { Expense } from './expenses';
import { sameBill } from './bank';
import { readRepeat } from './repeat';

/**
 * V20-501 (Dan, Nov 23, Books): the Budget audit. Press it any time; it reads Expenses (what was really paid,
 * last month and this month up to today) against the Budget and lists what should change:
 *   1. add:    a charge labelled FIXED that no budget line covers becomes a monthly budget line.
 *   2. price:  a bill whose latest charge differs from its budget amount takes the new price (SoundCloud).
 *   3. rhythm: an annual bill charged in two different months is monthly now (YouTube), at the new price.
 * Nothing changes until you press Apply; untick anything you don't want.
 */
export type AuditKind = 'add' | 'price' | 'rhythm';

export interface AuditChange {
  key: string;
  kind: AuditKind;
  /** The line as it is now (null for an add). */
  before: BudgetLine | null;
  /** The line after the change. */
  after: BudgetLine;
  /** The charges it's based on, newest first. */
  charges: Expense[];
  why: string;
}

const bill = (l: BudgetLine) => l.type.toUpperCase() === 'FIXED' || l.section === 'fixed' || l.section === 'annual';
const cents = (a: number | null, b: number | null) => Math.abs((a ?? 0) - (b ?? 0)) >= 0.005;
const cad = (n: number | null) => (n ?? 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const SKIP = new Set(['paypal', 'subscription', 'subscr', 'subscriptions', 'payment', 'monthly', 'annual', 'google', 'apple', 'amazon', 'service', 'insurance', 'canada', 'online']);
/** The same bill: sameBill, or a distinctive word of one inside the other with spaces dropped ("PayPal - Soundcloud" ↔ "Sound Cloud Subscription"). */
export function alike(a: string, b: string) {
  if (sameBill(a, b)) return true;
  const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !SKIP.has(w));
  const sa = squash(a);
  const sb = squash(b);
  return words(a).some((w) => sb.includes(w)) || words(b).some((w) => sa.includes(w));
}

/** From the 1st of last month. */
export function auditFrom(today: string) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const d = new Date(y, m - 1, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function auditBudget(lines: BudgetLine[], expenses: Expense[], today: string): AuditChange[] {
  const from = auditFrom(today);
  const recent = expenses.filter((e) => e.date >= from && e.date <= today && e.amount !== null && !e.currency).sort((a, b) => b.date.localeCompare(a.date));
  // Bills the audit can price: fixed / annual, priced in CAD (lines in another currency are left to Recalc), not weekly.
  const bills = lines.filter((l) => bill(l) && !l.currency && readRepeat(l.repeat).kind !== 'weekly');
  // Each charge belongs to one line at most: the line it's tied to, else the closest-priced line with the same name.
  const ofLine = new Map<string, Expense[]>();
  const covered = new Set<string>();
  for (const e of recent) {
    let line = e.budgetLineId ? lines.find((l) => l.id === e.budgetLineId) : undefined;
    if (!line) {
      const named = lines.filter((l) => l.description.trim() && alike(l.description, e.description));
      line = named.sort((a, b) => Math.abs((a.amount ?? 0) - (e.amount ?? 0)) - Math.abs((b.amount ?? 0) - (e.amount ?? 0)))[0];
    }
    if (!line) continue;
    covered.add(e.id);
    ofLine.set(line.id, [...(ofLine.get(line.id) ?? []), e]);
  }

  const out: AuditChange[] = [];
  for (const l of bills) {
    const charges = ofLine.get(l.id) ?? [];
    if (!charges.length) continue;
    const latest = charges[0];
    const months = new Set(charges.map((e) => e.date.slice(0, 7)));
    const annual = l.section === 'annual' || readRepeat(l.repeat).kind === 'annual';
    // 3. An annual bill charged in two different months has gone monthly.
    if (annual && months.size >= 2) {
      out.push({
        key: `rhythm:${l.id}`,
        kind: 'rhythm',
        before: l,
        after: { ...l, section: 'fixed', type: 'FIXED', repeat: `M:${dayOf(latest.date)}`, date: latest.date, amount: latest.amount },
        charges,
        why: `Charged in ${months.size} months (${[...months].sort().join(', ')}): annual → monthly on the ${dayOf(latest.date)}, ${cad(latest.amount)}.`
      });
      continue;
    }
    // 2. The latest month's charges: if none matches the budget amount, the newest one is the new price.
    const lastMonth = latest.date.slice(0, 7);
    const inLast = charges.filter((e) => e.date.slice(0, 7) === lastMonth);
    if (l.amount !== null && inLast.some((e) => !cents(e.amount, l.amount))) continue;
    if (l.amount === null || cents(latest.amount, l.amount)) {
      out.push({
        key: `price:${l.id}`,
        kind: 'price',
        before: l,
        after: { ...l, amount: latest.amount },
        charges,
        why: l.amount === null ? `No amount yet: charged ${cad(latest.amount)} on ${latest.date}.` : `Budget ${cad(l.amount)} → charged ${cad(latest.amount)} on ${latest.date}.`
      });
    }
  }

  // 1. FIXED charges no budget line covers, one new line per name.
  // Two names for one bill ("ChatGPT", "Openai Chatgpt Subscr") make one line, named by the newest charge.
  const groups: Expense[][] = [];
  for (const e of recent) {
    if (covered.has(e.id) || e.type.toUpperCase() !== 'FIXED' || !e.description.trim()) continue;
    const g = groups.find((x) => alike(x[0].description, e.description));
    if (g) g.push(e);
    else groups.push([e]);
  }
  let sort = lines.reduce((m, l) => Math.max(m, l.sort + 1), 0);
  for (const charges of groups) {
    const k = squash(charges[0].description);
    const e = charges[0];
    const months = [...new Set(charges.map((x) => x.date.slice(0, 7)))].sort();
    out.push({
      key: `add:${k}`,
      kind: 'add',
      before: null,
      after: {
        id: crypto.randomUUID(),
        section: 'fixed',
        project: e.project,
        date: e.date,
        description: e.description.trim(),
        method: e.method,
        type: 'FIXED',
        category: e.category,
        pmtCategory: e.pmtCategory,
        amount: e.amount,
        notes: 'Added by the Budget audit',
        sort: sort++,
        repeat: `M:${dayOf(e.date)}`
      },
      charges,
      why: `Fixed, charged ${charges.length === 1 ? 'once' : `${charges.length} times`} (${months.join(', ')}), not in the Budget: monthly on the ${dayOf(e.date)}, ${cad(e.amount)}.`
    });
  }
  const order: Record<AuditKind, number> = { add: 0, price: 1, rhythm: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.after.description.localeCompare(b.after.description, undefined, { sensitivity: 'base' }));
}
