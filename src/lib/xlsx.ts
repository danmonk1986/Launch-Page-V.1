/**
 * A small .xlsx writer (V12-042, Nov 1): no library, so the app stays light. An .xlsx is a zip of a
 * few XML files; this writes them (stored, not compressed) with a title block, a header row and
 * frozen panes. Nov 2: styled like the Launch Sheet (brand band, header in the app colours,
 * Calibri rows of one height, month separators that collapse, nothing past the data). Opens in Excel, Numbers and Google Sheets (File → Import, or drop it in Drive).
 */

export type Cell = string | number | boolean | null | undefined;
export interface SheetSpec {
  name: string;
  /** Rows above the table: [text, style]. */
  top: { text: string; style: 'title' | 'motto' | 'mantra' | 'note' }[];
  headers: string[];
  rows: Cell[][];
  widths?: number[];
  /** Separator rows + collapsible groups (Nov 2): by month of a date column, or by a column's value. */
  group?: { col: number; kind: 'month' | 'value' };
}

// ---------- zip (store) ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(8, 0, true); // stored
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    parts.push(new Uint8Array(head.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- workbook ----------

const esc = (s: string) =>
  s
    // Characters XML can't hold (control codes) are dropped.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const col = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Style ids in styles.xml below. */
const STYLE = { body: 0, title: 1, motto: 2, mantra: 3, note: 4, header: 5, band: 6, group: 7 } as const;

/** Row heights in points (Nov 2): every body row the same height (26px), like the Launch Sheet. */
const HT = { title: 34, band: 20, header: 28, body: 19.5 } as const;
/** The rows Google Sheets gives an imported tab. */
const PAD = { rows: 1000 } as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'YYYY-MM…' → { key: '2026-10', label: 'October 2026' }; anything else → no month. */
function monthOf(v: Cell) {
  const m = /^(\d{4})-(\d{2})/.exec(String(v ?? ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return { key: '', label: 'No date' };
  return { key: `${m[1]}-${m[2]}`, label: `${MONTHS[+m[2] - 1]} ${m[1]}` };
}

function cellXml(ref: string, v: Cell, style: number) {
  const s = style ? ` s="${style}"` : '';
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}"${s}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  // Sheets cap a cell at 32,767 characters.
  const text = String(v).slice(0, 32000);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

/**
 * The table as laid out (Nov 2): a month tab gets a Month column first (filter it to show one
 * month) and a grey separator row before each month; the rows under a separator are one group,
 * so − / + beside it hides or shows the month. A value tab (BUDGET by Section) does the same
 * per value without the extra column.
 */
function layout(sh: SheetSpec) {
  const g = sh.group;
  const headers = g?.kind === 'month' ? ['Month', ...sh.headers] : sh.headers;
  const out: { cells: Cell[]; kind: 'group' | 'body' }[] = [];
  let last: string | null = null;
  for (const row of sh.rows) {
    if (!g) {
      out.push({ cells: row, kind: 'body' });
      continue;
    }
    const m = g.kind === 'month' ? monthOf(row[g.col]) : { key: String(row[g.col] ?? ''), label: String(row[g.col] ?? '') || '(none)' };
    const cells = g.kind === 'month' ? [m.key, ...row] : row;
    if (m.key !== last) {
      // The separator carries the group's value in the filter column, so filtering keeps it.
      const sep: Cell[] = headers.map(() => '');
      sep[0] = g.kind === 'month' ? m.key : '';
      if (g.kind === 'month') sep[1] = m.label;
      else sep[g.col] = m.key;
      if (g.kind === 'value' && g.col !== 0) sep[0] = m.label;
      out.push({ cells: sep, kind: 'group' });
      last = m.key;
    }
    out.push({ cells, kind: 'body' });
  }
  return { headers, rows: out };
}

/** Where the header row sits: the brand rows, one band row, then the header. */
const headRowOf = (sh: SheetSpec) => sh.top.length + 2;

function sheetXml(sh: SheetSpec) {
  const { headers, rows: body } = layout(sh);
  const n = Math.max(1, headers.length);
  const last = col(n - 1);
  const grouped = !!sh.group;
  const rows: string[] = [];
  const band = (r: number, first: { text: string; style: number } | null, ht: number) =>
    `<row r="${r}" ht="${ht}" customHeight="1">${headers.map((_, i) => cellXml(`${col(i)}${r}`, i === 0 && first ? first.text : '', i === 0 && first ? first.style : STYLE.band)).join('') || cellXml(`A${r}`, first?.text ?? '', first?.style ?? STYLE.band)}</row>`;
  let r = 1;
  for (const t of sh.top) {
    rows.push(band(r, { text: t.text, style: STYLE[t.style] }, t.style === 'title' ? HT.title : HT.band));
    r += 1;
  }
  rows.push(band(r, null, HT.band / 2)); // a thin band row before the table
  r += 1;
  const headRow = r;
  rows.push(`<row r="${r}" ht="${HT.header}" customHeight="1">${headers.map((h, i) => cellXml(`${col(i)}${r}`, h, STYLE.header)).join('')}</row>`);
  r += 1;
  for (const row of body) {
    const style = row.kind === 'group' ? STYLE.group : STYLE.body;
    const lvl = grouped && row.kind === 'body' ? ' outlineLevel="1"' : '';
    rows.push(`<row r="${r}" ht="${HT.body}" customHeight="1"${lvl}>${headers.map((_, i) => cellXml(`${col(i)}${r}`, row.cells[i], style)).join('')}</row>`);
    r += 1;
  }
  const lastRow = r - 1;
  const sample = body.filter((x) => x.kind === 'body').slice(0, 200);
  const widths = headers.map((h, i) => {
    const own = grouped && sh.group?.kind === 'month' ? (i === 0 ? 9 : sh.widths?.[i - 1]) : sh.widths?.[i];
    const w = own ?? Math.min(48, Math.max(h.length + 3, ...sample.map((row) => String(row.cells[i] ?? '').length + 2), 9));
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  });
  // Nothing past the data. Rows: Google Sheets pads an import to 1,000 rows and only honours hidden
  // rows named one by one, so those are listed (Excel hides the rest: zeroHeight). Columns: Excel
  // hides them all; Google only ever hides the first spare one (tested Nov 2), so the rest show empty.
  if (n < 16384) widths.push(`<col min="${n + 1}" max="16384" width="9" customWidth="1" hidden="1"/>`);
  for (let x = lastRow + 1; x <= PAD.rows; x++) rows.push(`<row r="${x}" hidden="1"/>`);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetPr><outlinePr summaryBelow="0"/></sheetPr>` +
    `<dimension ref="A1:${last}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="${HT.body}" customHeight="1" zeroHeight="1"${grouped ? ' outlineLevelRow="1"' : ''}/>` +
    `<cols>${widths.join('')}</cols>` +
    `<sheetData>${rows.join('')}</sheetData>` +
    (body.length ? `<autoFilter ref="A${headRow}:${last}${lastRow}"/>` : '') +
    '</worksheet>'
  );
}

/** The filter range, for the workbook's hidden name. */
function filterRef(sh: SheetSpec) {
  const { headers, rows } = layout(sh);
  const h = headRowOf(sh);
  return rows.length ? `$A$${h}:$${col(Math.max(0, headers.length - 1))}$${h + rows.length}` : '';
}

/** A colour mixed toward white: the brand's light band behind the titles. */
function tint(h: string, amount: number) {
  const x = h.replace('#', '').padStart(6, '0').slice(0, 6);
  const c = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0).map((v) => Math.round(255 - (255 - v) * amount));
  return c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Builds the .xlsx; `brand` colours the titles (hex without #). */
export function buildXlsx(sheets: SheetSpec[], brand: { purple: string; teal: string }): Blob {
  const enc = new TextEncoder();
  const hex = (h: string) => 'FF' + h.replace('#', '').toUpperCase().padStart(6, '0').slice(0, 6);
  const names = sheets.map((s, i) => {
    // Tab names: 31 characters, none of : \ / ? * [ ]
    const base = s.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || `Sheet${i + 1}`;
    return base;
  });
  const body = '<name val="Calibri"/>';
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="7">' +
    `<font><sz val="10"/>${body}</font>` +
    '<font><b/><sz val="18"/><color rgb="FF434343"/><name val="Oswald"/></font>' +
    `<font><b/><sz val="11"/><color rgb="FF434343"/>${body}</font>` +
    `<font><i/><sz val="10"/><color rgb="${hex(brand.purple)}"/>${body}</font>` +
    `<font><sz val="9"/><color rgb="FF777777"/>${body}</font>` +
    `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/>${body}</font>` +
    `<font><b/><sz val="10"/><color rgb="FF333333"/>${body}</font>` +
    '</fonts>' +
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    `<fill><patternFill patternType="solid"><fgColor rgb="${hex(brand.purple)}"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="${hex(tint(brand.purple, 0.12))}"/><bgColor indexed="64"/></patternFill></fill>` +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFCCCCCC"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="8">' +
    // 0 body · 1 title · 2 motto · 3 mantra · 4 note · 5 header · 6 band · 7 month / group separator
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="0"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
  const files = [
    {
      name: '[Content_Types].xml',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    },
    {
      name: '_rels/.rels',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    },
    {
      name: 'xl/workbook.xml',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets>' +
        // Filters need a hidden name per sheet.
        '<definedNames>' +
        sheets
          .map((s, i) => {
            const ref = filterRef(s);
            return ref ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!${ref}</definedName>` : '';
          })
          .join('') +
        '</definedNames>' +
        '</workbook>'
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>'
    },
    { name: 'xl/styles.xml', text: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) }))
  ];
  const bytes = zip(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
