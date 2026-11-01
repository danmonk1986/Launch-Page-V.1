/**
 * A small .xlsx writer (V12-042, Nov 1): no library, so the app stays light. An .xlsx is a zip of a
 * few XML files; this writes them (stored, not compressed) with a title block, a header row and
 * frozen panes. Opens in Excel, Numbers and Google Sheets (File → Import, or drop it in Drive).
 */

export type Cell = string | number | boolean | null | undefined;
export interface SheetSpec {
  name: string;
  /** Rows above the table: [text, style]. */
  top: { text: string; style: 'title' | 'motto' | 'mantra' | 'note' }[];
  headers: string[];
  rows: Cell[][];
  widths?: number[];
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
const STYLE = { body: 0, title: 1, motto: 2, mantra: 3, note: 4, header: 5, wrap: 6 } as const;

function cellXml(ref: string, v: Cell, style: number) {
  const s = style ? ` s="${style}"` : '';
  if (v === null || v === undefined || v === '') return style ? `<c r="${ref}"${s}/>` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  // Sheets cap a cell at 32,767 characters.
  const text = String(v).slice(0, 32000);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function sheetXml(sh: SheetSpec) {
  const rows: string[] = [];
  let r = 1;
  for (const t of sh.top) {
    rows.push(`<row r="${r}">${cellXml(`A${r}`, t.text, STYLE[t.style])}</row>`);
    r += 1;
  }
  r += 1; // a blank row before the table
  const headRow = r;
  rows.push(`<row r="${r}">${sh.headers.map((h, i) => cellXml(`${col(i)}${r}`, h, STYLE.header)).join('')}</row>`);
  r += 1;
  for (const row of sh.rows) {
    rows.push(`<row r="${r}">${row.map((v, i) => cellXml(`${col(i)}${r}`, v, typeof v === 'string' && v.length > 60 ? STYLE.wrap : STYLE.body)).join('')}</row>`);
    r += 1;
  }
  const widths = sh.headers.map((h, i) => {
    const w = sh.widths?.[i] ?? Math.min(60, Math.max(h.length + 2, ...sh.rows.slice(0, 200).map((row) => String(row[i] ?? '').length + 2), 8));
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (widths.length ? `<cols>${widths.join('')}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    (sh.rows.length ? `<autoFilter ref="A${headRow}:${col(Math.max(0, sh.headers.length - 1))}${headRow + sh.rows.length}"/>` : '') +
    '</worksheet>'
  );
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
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' +
    '<font><sz val="11"/><name val="Arial"/></font>' +
    `<font><b/><sz val="20"/><color rgb="${hex(brand.teal)}"/><name val="Arial"/></font>` +
    '<font><b/><sz val="13"/><name val="Arial"/></font>' +
    `<font><i/><sz val="11"/><color rgb="${hex(brand.purple)}"/><name val="Arial"/></font>` +
    '<font><sz val="10"/><color rgb="FF777777"/><name val="Arial"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
    '</fonts>' +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${hex(brand.purple)}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
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
          .map((s, i) => (s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!$A$${s.top.length + 2}:$${col(Math.max(0, s.headers.length - 1))}$${s.top.length + 2 + s.rows.length}</definedName>` : ''))
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
