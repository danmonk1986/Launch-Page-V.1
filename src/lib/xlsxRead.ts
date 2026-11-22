/**
 * V20-458 (Dan, Nov 22): READ an .xlsx (the blank books file, a Launch Sheet export, or a Google Sheets / Excel
 * download) into plain rows per tab. No library: an .xlsx is a zip of XML files; the browser inflates them
 * (DecompressionStream). Returns { tabName: rows of cell text } in the workbook's tab order.
 */

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

/** The zip's files by name (only the ones asked for are inflated). */
async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Record<string, string>> {
  const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That file isn’t an .xlsx workbook.');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + size);
    out[name] = dec.decode(method === 8 ? await inflate(raw) : raw);
  }
  return out;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
/** All the <t> text inside a piece of XML (a shared string or an inline string, rich runs joined). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
const colIndex = (ref: string) => {
  const letters = (ref.match(/^[A-Z]+/) ?? ['A'])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file: Blob): Promise<{ name: string; rows: string[][] }[]> {
  const buf = await file.arrayBuffer();
  const files = await unzip(buf, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const wb = files['xl/workbook.xml'];
  if (!wb) throw new Error('That workbook has no sheets.');
  const rels = files['xl/_rels/workbook.xml.rels'] ?? '';
  const target: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = m[1].match(/\bId="([^"]+)"/)?.[1];
    const t = m[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && t) target[id] = t.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const shared = [...(files['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const tabs: { name: string; rows: string[][] }[] = [];
  let i = 0;
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    i++;
    const name = unescapeXml(m[1].match(/\bname="([^"]*)"/)?.[1] ?? `Sheet${i}`);
    const rid = m[1].match(/\br:id="([^"]+)"/)?.[1] ?? '';
    const xml = files[target[rid] ?? `xl/worksheets/sheet${i}.xml`] ?? '';
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const rowNum = Number((r[1] ?? r[3] ?? '').match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
      const cells: string[] = [];
      for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        const col = ref ? colIndex(ref) : cells.length;
        const t = attrs.match(/\bt="([^"]+)"/)?.[1] ?? 'n';
        const inner = c[2] ?? '';
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let text = '';
        if (t === 's') text = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') text = textOf(inner);
        else if (t === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
        else text = v !== undefined ? unescapeXml(v) : '';
        cells[col] = text;
      }
      while (rows.length < rowNum - 1) rows.push([]);
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    tabs.push({ name, rows });
  }
  return tabs;
}

/** A spreadsheet day number (Excel / Google Sheets dates: days since Dec 30, 1899) as yyyy-mm-dd. */
export function serialToIso(v: string): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}
