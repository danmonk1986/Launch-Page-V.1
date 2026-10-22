/** The printed invoice (Oct 22): laid out like the Launch Sheet's invoice tab. Pure, no React. */
import { daysWorked, invoiceLines, invoiceTotals, longDate, money, type Customer, type Invoice, type InvoiceProfile } from './invoices';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const shortNum = (s: string | null) => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${m}/${d}/${y}`;
};

/**
 * Opens the invoice in a new tab, laid out like the Launch Sheet's invoice tab (Oct 22): one
 * four-column grid with grey header bands, the business name large on the left, Invoice # /
 * Start / End / Days / Job ID down the middle and the customer on the right. Print or save as PDF.
 */
export function invoiceHtml(inv: Invoice, c: Customer | null, pr: InvoiceProfile | null) {
  const t = invoiceTotals(inv);
  const lines = invoiceLines(inv);
  const e = (v: string | null | undefined) => esc(v ?? '');
  const head = (v: string) => `<td class="band">${v}</td>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${e(inv.number || 'Invoice')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Roboto:wght@400;700&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:14mm 12mm;font-family:Roboto,Arial,Helvetica,sans-serif;font-size:10px;color:#111}
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.a{width:16%}col.b{width:42%}col.c{width:12%}col.d{width:30%}
td{border:1px solid #d9d9d9;padding:4px 5px;height:20px;vertical-align:middle;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.band{background:#d9d9d9;font-weight:700;text-decoration:underline;text-align:center}
.bar td{background:#d9d9d9}
.name{font-family:Oswald,Impact,'Arial Narrow',sans-serif;font-weight:700;font-size:30px;text-align:center;letter-spacing:.02em}
.c{text-align:center}.r{text-align:right}.b{font-weight:700}
.tot td{border-color:#ececec}
</style></head><body>
<table><colgroup><col class="a"><col class="b"><col class="c"><col class="d"></colgroup><tbody>
<tr class="bar"><td colspan="2"></td>${head('Invoice #')}${head('Customer')}</tr>
<tr><td colspan="2" rowspan="6" class="name">${e(pr?.business)}</td><td class="c b">${e(inv.number)}</td><td></td></tr>
<tr>${head('START')}<td class="r b">${e(c?.name)}</td></tr>
<tr><td class="c">${shortNum(inv.start)}</td><td class="r">${e(c?.address)}</td></tr>
<tr>${head('END')}<td class="r">${e(c?.city)}</td></tr>
<tr><td class="c">${shortNum(inv.end)}</td><td class="r">${e(c?.phone)}</td></tr>
<tr>${head('Days')}<td class="r">${e(c?.email)}</td></tr>
<tr><td colspan="2" class="c">${e([pr?.person, pr?.phone].filter(Boolean).join(' // '))}</td><td class="c">${daysWorked(inv).length}</td><td></td></tr>
<tr><td colspan="2" class="c">${e([pr?.email, pr?.web].filter(Boolean).join(' // '))}</td>${head('Job ID')}<td class="r">${e(inv.operator)}</td></tr>
<tr><td colspan="2" class="c">${e(pr?.gstNumber)}</td><td class="c">${e(inv.jobId)}</td><td class="r">${e(inv.well)}</td></tr>
<tr>${head('Date')}${head('Description')}${head('Rate')}${head('Total')}</tr>
<tr><td></td><td></td><td></td><td></td></tr>
${lines.map((l) => `<tr><td class="r">${l.date ? e(longDate(l.date)) : ''}</td><td>${e(l.desc)}</td><td class="r">${money(l.rate)}</td><td class="r">${money(l.total)}</td></tr>`).join('\n')}
<tr><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td></td><td></td><td>Total</td><td class="r">${money(t.total)}</td></tr>
<tr class="tot"><td></td><td></td><td class="c b">G.S.T</td><td class="r">${money(t.gst)}</td></tr>
<tr class="tot"><td></td><td></td><td>Sub Total</td><td class="r">${money(t.subTotal)}</td></tr>
</tbody></table>
<script>document.fonts.ready.then(function(){window.print()})</script>
</body></html>`;
  return html;
}

/** Opens it in a new tab and brings up Print (Save as PDF from there). */
export function printInvoice(inv: Invoice, c: Customer | null, pr: InvoiceProfile | null) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(invoiceHtml(inv, c, pr));
  w.document.close();
}
