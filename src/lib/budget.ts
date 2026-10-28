import { makeStore } from './store';

/**
 * Budget V.1: the BUDGET tab of the Launch Sheet as a list of lines, in four groups.
 * Comes in from the sheet (CSV) or a JSON file, goes back out as a CSV in the sheet's own
 * column order, which Google Sheets and this page can both import.
 */
export type BudgetSection = 'fixed' | 'variable' | 'annual' | 'planned';

export const BUDGET_SECTIONS: { id: BudgetSection; title: string; pill: string; sheet: string }[] = [
  { id: 'fixed', title: 'Monthly fixed', pill: 'Monthly fixed', sheet: 'MONTHLY FIXED EXPENSES' },
  { id: 'variable', title: 'Monthly variable', pill: 'Monthly variable', sheet: 'MONTHLY VARIABLE EXPENSES' },
  { id: 'annual', title: 'Annual', pill: 'Annual', sheet: 'ANNUAL FIXED EXPENSES' },
  { id: 'planned', title: 'Planned', pill: 'Planned', sheet: 'PLANNED EXPENSES' }
];

/** The sheet's budget categories, in its column order. */
export const BUDGET_CATEGORIES = ['LIVING', 'SAVINGS', 'VICES', 'L-I-V-I-N', 'TRAVEL', 'MWD', 'SHOP'];
export const PMT_TYPES = ['FIXED', 'VARIABLE'];

export interface BudgetLine {
  id: string;
  section: BudgetSection;
  project: string;
  /** yyyy-mm-dd or null */
  date: string | null;
  description: string;
  method: string;
  type: string;
  category: string;
  pmtCategory: string;
  /** null when the sheet left it blank */
  amount: number | null;
  notes: string;
  sort: number;
  /** How it repeats (lib/repeat.ts), e.g. "M:1" for rent on the 1st. Column from 0026. */
  repeat?: string | null;
  /** Priced in another currency (Oct 25): the original price, e.g. 15.69 USD; `amount` is the CAD. Columns from 0032. */
  foreign?: number | null;
  currency?: string;
}

export function newBudgetLine(section: BudgetSection, sort: number): BudgetLine {
  return { id: crypto.randomUUID(), section, project: '', date: null, description: '', method: '', type: section === 'fixed' ? 'FIXED' : 'VARIABLE', category: '', pmtCategory: '', amount: null, notes: '', sort };
}

type Row = {
  id: string;
  section: string;
  project: string;
  on_date: string | null;
  description: string;
  method: string;
  pmt_type: string;
  category: string;
  pmt_category: string;
  amount: number | string | null;
  notes: string;
  sort: number;
  repeat_rule?: string | null;
  foreign_amount?: number | string | null;
  currency?: string | null;
};

export const budgetStore = makeStore<BudgetLine, Row>({
  table: 'budget_lines',
  localKey: 'launchpage.budget.v1',
  orderBy: 'sort',
  script: 'supabase/migrations/0023_budget.sql',
  latestScript: 'supabase/migrations/0032_currency.sql',
  // Before 0032 is run: save without the original price (kept on this device until then).
  legacyRow: (r) => {
    const x = { ...r };
    delete x.foreign_amount;
    delete x.currency;
    return x;
  },
  seed: () => [],
  toRow: (l) => ({ id: l.id, section: l.section, project: l.project, on_date: l.date, description: l.description, method: l.method, pmt_type: l.type, category: l.category, pmt_category: l.pmtCategory, amount: l.amount, notes: l.notes, sort: l.sort, ...(l.repeat !== undefined ? { repeat_rule: l.repeat } : {}), ...(l.currency ? { currency: l.currency, foreign_amount: l.foreign ?? null } : {}) }),
  fromRow: (r) => ({
    id: r.id,
    section: (BUDGET_SECTIONS.some((s) => s.id === r.section) ? r.section : 'variable') as BudgetSection,
    project: r.project ?? '',
    date: r.on_date ? String(r.on_date).slice(0, 10) : null,
    description: r.description ?? '',
    method: r.method ?? '',
    type: r.pmt_type ?? '',
    category: r.category ?? '',
    pmtCategory: r.pmt_category ?? '',
    amount: r.amount === null || r.amount === '' || r.amount === undefined ? null : Number(r.amount),
    notes: r.notes ?? '',
    sort: r.sort ?? 0,
    ...(r.repeat_rule !== undefined ? { repeat: r.repeat_rule } : {}),
    ...(r.currency ? { currency: r.currency, foreign: r.foreign_amount === null || r.foreign_amount === undefined || r.foreign_amount === '' ? null : Number(r.foreign_amount) } : {})
  })
});

// ---------- totals ----------

export const lineTotal = (l: BudgetLine) => l.amount ?? 0;
export const sumLines = (list: BudgetLine[]) => list.reduce((a, l) => a + lineTotal(l), 0);

export type BudgetGroupBy = 'section' | 'pmtCategory' | 'project' | 'category';
export const GROUP_BY: { id: BudgetGroupBy; label: string }[] = [
  { id: 'section', label: 'Section' },
  { id: 'pmtCategory', label: 'Payment category' },
  { id: 'project', label: 'Project' },
  { id: 'category', label: 'Budget group' }
];

/** Which box a line counts in: its group (fixed, variable…) or its pmt category / project / budget category. */
export const groupKey = (l: BudgetLine, by: BudgetGroupBy) => (by === 'section' ? l.section : (l[by] || '').trim().toUpperCase() || 'OTHER');

/** A month of spending: fixed + variable lines, plus annual lines spread over 12 months. */
export function monthlyByCategory(lines: BudgetLine[], by: BudgetGroupBy = 'category') {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (l.section === 'planned') continue;
    const per = l.section === 'annual' ? lineTotal(l) / 12 : lineTotal(l);
    const k = groupKey(l, by);
    out[k] = (out[k] ?? 0) + per;
  }
  return out;
}

export const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- CSV ----------

/** RFC 4180-ish: quoted cells, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const key = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

function toIso(d: string): string | null {
  const v = d.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // the sheet's m/d/yyyy
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}
const fromIso = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

function toAmount(v: string): number | null {
  const s = v.replace(/[$,\s]/g, '');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

function sectionFrom(cell: string): BudgetSection | null {
  const k = key(cell);
  if (k.includes('MONTHLY FIXED')) return 'fixed';
  if (k.includes('MONTHLY VARIABLE')) return 'variable';
  if (k.includes('ANNUAL')) return 'annual';
  if (k.includes('PLANNED')) return 'planned';
  return null;
}

/**
 * The BUDGET tab as CSV (Google Sheets: File → Download → CSV with BUDGET open), this page's
 * own CSV export, or a whole-workbook text export with a "## Sheet name: BUDGET" part.
 * Columns are found by their header names, so the sheet's extra category columns don't matter.
 */
export function linesFromCsv(text: string): BudgetLine[] {
  let body = text;
  const part = text.match(/## Sheet name:\s*"?BUDGET"?\s*\r?\n([\s\S]*?)(?=\r?\n## Sheet name:|$)/i);
  if (part) body = part[1];
  const rows = parseCsv(body);
  const head = rows.findIndex((r) => r.some((c) => key(c) === 'PROJECT') && r.some((c) => key(c) === 'DESCRIPTION'));
  if (head < 0) throw new Error('No PROJECT / DESCRIPTION header row found. Export the BUDGET tab as CSV.');
  const h = rows[head].map(key);
  const col = (...names: string[]) => h.findIndex((c) => names.includes(c));
  const C = {
    project: col('PROJECT'),
    date: col('DATE'),
    desc: col('DESCRIPTION'),
    method: col('PMT METHOD', 'PAYMENT METHOD', 'METHOD'),
    type: col('PMT TYPE', 'PAYMENT TYPE', 'TYPE'),
    category: col('BUDGET CATEGORY', 'CATEGORY'),
    pmtCategory: col('PMT CATEGORY', 'PAYMENT CATEGORY'),
    amount: col('TOTAL $', 'AMOUNT', 'TOTAL'),
    notes: col('NOTES')
  };
  // Sheet errors (#VALUE!, #REF!, #N/A…) count as blank.
  const at = (r: string[], i: number) => {
    const v = i >= 0 ? (r[i] ?? '').trim() : '';
    return /^#(VALUE|REF|N\/A|DIV\/0|ERROR|NAME|NUM|NULL)[!?]?$/i.test(v) ? '' : v;
  };
  let section: BudgetSection = 'fixed';
  const out: BudgetLine[] = [];
  for (const r of rows.slice(head + 1)) {
    const first = (r[0] ?? '').trim();
    const s = sectionFrom(first);
    // A group heading row ("  MONTHLY FIXED EXPENSES,,#VALUE!…") switches the group.
    if (s && !at(r, C.desc)) {
      section = s;
      continue;
    }
    const description = at(r, C.desc);
    const project = at(r, C.project);
    // Planned lines in the sheet sometimes sit in the PROJECT or DATE column alone.
    const loose = !description ? [project, at(r, C.date)].filter((x) => x && !toIso(x)) : [];
    if (!description && !loose.length) continue;
    out.push({
      id: crypto.randomUUID(),
      section,
      project: description ? project : loose.length > 1 ? project : '',
      date: toIso(at(r, C.date)),
      description: description || loose[loose.length - 1].trim(),
      method: at(r, C.method),
      type: at(r, C.type).toUpperCase(),
      category: at(r, C.category).toUpperCase(),
      pmtCategory: at(r, C.pmtCategory).toUpperCase(),
      amount: toAmount(at(r, C.amount)),
      notes: at(r, C.notes),
      sort: out.length
    });
  }
  return out;
}

/** This page's JSON (an array, or { lines: [...] }) or rows shaped like the sheet. */
export function linesFromJson(text: string): BudgetLine[] {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { lines?: unknown }).lines) ? (data as { lines: unknown[] }).lines : null;
  if (!list) throw new Error('Expected a list of budget lines.');
  return list.map((raw, i) => {
    const o = raw as Record<string, unknown>;
    const get = (...ks: string[]) => {
      for (const k of ks) {
        const hit = Object.keys(o).find((x) => key(x) === key(k));
        if (hit && o[hit] !== null && o[hit] !== undefined) return String(o[hit]);
      }
      return '';
    };
    const sec = get('section');
    const section = (BUDGET_SECTIONS.find((s) => s.id === sec)?.id ?? sectionFrom(sec) ?? 'variable') as BudgetSection;
    return {
      id: crypto.randomUUID(),
      section,
      project: get('project'),
      date: toIso(get('date')),
      description: get('description'),
      method: get('method', 'pmt method'),
      type: get('type', 'pmt type').toUpperCase(),
      category: get('category', 'budget category').toUpperCase(),
      pmtCategory: get('pmtCategory', 'pmt category').toUpperCase(),
      amount: toAmount(get('amount', 'total $', 'total')),
      notes: get('notes'),
      sort: i
    };
  }).filter((l) => l.description.trim());
}

export function linesFromFile(name: string, text: string): BudgetLine[] {
  const t = text.replace(/^﻿/, '');
  return /\.json$/i.test(name) || /^\s*[[{]/.test(t) ? linesFromJson(t) : linesFromCsv(t);
}

/** Back out in the sheet's column order, grouped under the sheet's own group headings. */
export function linesToCsv(lines: BudgetLine[]): string {
  const head = ['PROJECT', 'DATE', 'DESCRIPTION', 'PMT METHOD', 'PMT TYPE', 'BUDGET CATEGORY', 'PMT CATEGORY', 'TOTAL $', 'NOTES'];
  const out: string[][] = [['BUDGET (LaunchPage export)'], head];
  for (const s of BUDGET_SECTIONS) {
    out.push([`  ${s.sheet}`]);
    for (const l of lines.filter((x) => x.section === s.id).sort((a, b) => a.sort - b.sort)) {
      out.push([l.project, fromIso(l.date), l.description, l.method, l.type, l.category, l.pmtCategory, l.amount === null ? '' : l.amount.toFixed(2), l.notes]);
    }
  }
  return out.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
