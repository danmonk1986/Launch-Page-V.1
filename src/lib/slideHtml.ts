// KNOWLEDGE!B4SE slide viewer (KB-034): turns a stored slide (one <section> in the Slides format) into
// safe markup for the viewer. Allow-list only: anything that could run code, load a page or reach out
// (scripts, frames, forms, event handlers, javascript: links, outside images, CSS url()s) is dropped.
// The Slides format's own elements are drawn here: <x-icon> (Lucide icons), <x-shape> (arrows,
// ellipse, diamond, line) and <x-connector> (an arrow line).
import { SLIDE_ICONS } from './slideIcons';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_TAGS = new Set([
  'section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'span', 'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr', 'sup', 'sub', 'small'
]);
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'clippath', 'mask', 'pattern', 'use', 'text', 'tspan', 'title', 'desc', 'marker', 'symbol',
  'filter', 'fegaussianblur', 'feoffset', 'feblend', 'fecolormatrix', 'fecomposite', 'feflood', 'femerge', 'femergenode', 'feturbulence', 'fedisplacementmap', 'fedropshadow',
  'fecomponenttransfer', 'fefuncr', 'fefuncg', 'fefuncb', 'fefunca', 'femorphology', 'feconvolvematrix', 'fetile',
  'fediffuselighting', 'fespecularlighting', 'fepointlight', 'fedistantlight', 'fespotlight'
]);
const HTML_ATTRS = new Set(['style', 'id', 'href', 'src', 'alt', 'width', 'height', 'hidden', 'data-text', 'title']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'frame', 'frameset', 'link', 'meta', 'base', 'form', 'input', 'button', 'select', 'textarea', 'template', 'x-embed', 'foreignobject', 'audio', 'video', 'source', 'canvas', 'aside', 'noscript']);

/** CSS from the slide: kept unless it could load or run something. */
function safeStyle(css: string): string | null {
  const lower = css.toLowerCase();
  if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/.test(lower)) return null;
  // url(...) only for inline images
  if (/url\s*\(/.test(lower.replace(/url\(\s*['"]?data:image\/(png|jpe?g|gif|webp);base64,[^)]*\)/g, ''))) return null;
  return css.replace(/position\s*:\s*fixed/gi, 'position:absolute');
}

function safeUrl(v: string, kind: 'href' | 'src'): string | null {
  const t = v.trim();
  if (kind === 'src') return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(t) ? t : null;
  return /^(https?:|mailto:)/i.test(t) || t.startsWith('#') ? t : null;
}

function el(doc: Document, html: string): Element {
  const t = doc.createElement('template');
  t.innerHTML = html;
  return t.content.firstElementChild as Element;
}

/** The format's custom elements, drawn with plain HTML and SVG. */
function drawCustom(doc: Document, node: Element): Element | null {
  const tag = node.tagName.toLowerCase();
  const style = safeStyle(node.getAttribute('style') ?? '') ?? '';
  if (tag === 'x-icon') {
    const paths = SLIDE_ICONS[node.getAttribute('name') ?? ''];
    if (!paths) return null;
    const wrap = el(doc, `<span class="x-icon"><svg xmlns="${SVG_NS}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%">${paths}</svg></span>`);
    wrap.setAttribute('style', style);
    return wrap;
  }
  if (tag === 'x-shape') {
    const kind = node.getAttribute('kind') ?? '';
    const div = doc.createElement('div');
    div.className = `x-shape x-shape-${/^[a-z-]+$/.test(kind) ? kind : 'rect'}`;
    div.setAttribute('style', style);
    return div;
  }
  if (tag === 'x-connector') {
    const head = node.getAttribute('head') ?? 'end';
    const span = el(
      doc,
      `<span class="x-connector"><svg xmlns="${SVG_NS}" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 20"><line x1="${head === 'both' ? 12 : 0}" y1="10" x2="${head === 'none' ? 100 : 88}" y2="10" stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke"/>${head === 'none' ? '' : '<polygon points="86,3 100,10 86,17" fill="currentColor"/>'}${head === 'both' ? '<polygon points="14,3 0,10 14,17" fill="currentColor"/>' : ''}</svg></span>`
    );
    span.setAttribute('style', style);
    return span;
  }
  return null;
}

function clean(doc: Document, node: Element, inSvg: boolean): Element | null {
  const tag = node.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;
  if (tag.startsWith('x-')) return drawCustom(doc, node);
  const svg = inSvg || tag === 'svg';
  if (svg && !SVG_TAGS.has(tag)) return null;
  if (!svg && !HTML_TAGS.has(tag)) {
    // Unknown wrapper: keep what's inside it.
    const span = doc.createElement('span');
    for (const child of [...node.childNodes]) {
      const c = cleanNode(doc, child, svg);
      if (c) span.appendChild(c);
    }
    return span;
  }
  const out = svg ? doc.createElementNS(SVG_NS, node.tagName) : doc.createElement(tag);
  for (const a of [...node.attributes]) {
    const name = a.name.toLowerCase();
    if (name.startsWith('on')) continue;
    if (name === 'style') {
      const s = safeStyle(a.value);
      if (s !== null) out.setAttribute('style', s);
      continue;
    }
    if (svg) {
      // Inside a drawing: any presentation attribute, but links only to the drawing's own #ids.
      if (name === 'href' || name === 'xlink:href') {
        if (a.value.startsWith('#')) out.setAttribute('href', a.value);
        continue;
      }
      if (/^[a-z][a-z0-9:-]*$/.test(name) && !/url\(\s*['"]?(?!#)/i.test(a.value)) out.setAttribute(a.name, a.value);
      continue;
    }
    if (!HTML_ATTRS.has(name) && !name.startsWith('data-')) continue;
    if (name === 'href' || name === 'src') {
      const u = safeUrl(a.value, name);
      if (u) out.setAttribute(name, u);
      continue;
    }
    out.setAttribute(name, a.value);
  }
  if (tag === 'a') {
    out.setAttribute('target', '_blank');
    out.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'img' && !out.getAttribute('src')) return null;
  for (const child of [...node.childNodes]) {
    const c = cleanNode(doc, child, svg);
    if (c) out.appendChild(c);
  }
  return out;
}

function cleanNode(doc: Document, n: Node, inSvg: boolean): Node | null {
  if (n.nodeType === Node.TEXT_NODE) return doc.createTextNode(n.textContent ?? '');
  if (n.nodeType === Node.ELEMENT_NODE) return clean(doc, n as Element, inSvg);
  return null;
}

/** Safe markup for one slide: a single <section>, or '' if there's nothing to show. */
export function slideMarkup(html: string): string {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const section = parsed.body.querySelector('section');
  if (!section) return '';
  const doc = document.implementation.createHTMLDocument('');
  const out = clean(doc, section, false);
  if (!out) return '';
  out.removeAttribute('hidden');
  // Paint order as the format has it: pinned backdrops listed before the first flow child sit under the
  // flow content, pinned boxes after it sit on top. (Slide children are flex/grid items, so z-index works
  // without changing what their pinned children pin to.)
  let seenFlow = false;
  for (const child of [...out.children]) {
    const pinned = /position\s*:\s*absolute/i.test(child.getAttribute('style') ?? '');
    const z = pinned ? (seenFlow ? 2 : 0) : 1;
    if (!pinned) seenFlow = true;
    child.setAttribute('style', `${(child.getAttribute('style') ?? '').replace(/;\s*$/, '')};z-index:${z}`);
  }
  return out.outerHTML;
}

/** The Slides format's base look (fixed 1920×1080 canvas, tag defaults), scoped to the viewer. */
export const SLIDE_CSS = `
:host { all: initial; display: block; }
.stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; overflow: hidden; }
.stage * { box-sizing: border-box; margin: 0; }
section { position: relative; width: 1920px; height: 1080px; overflow: hidden; font-family: 'Space Grotesk', Arial, sans-serif; font-size: 32px; color: #1A1338; background: #fff; }
section:not([style*="display"]), section div:not([style*="display"]) { display: flex; flex-direction: column; }
h1 { font-size: 96px; font-weight: 600; line-height: 1.1; }
h2 { font-size: 64px; font-weight: 600; line-height: 1.15; }
h3 { font-size: 44px; font-weight: 600; line-height: 1.2; }
h4 { font-weight: 600; }
p { line-height: 1.4; overflow-wrap: break-word; }
ul, ol { padding-left: 1.2em; line-height: 1.4; }
li + li { margin-top: 0.3em; }
b, strong { font-weight: 700; }
a { color: inherit; text-decoration: underline; text-underline-offset: 0.15em; }
img { display: block; }
svg { display: block; overflow: visible; }
table { border-collapse: separate; border-spacing: 0; overflow: hidden; }
th, td { padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
tr + tr > td, tr + tr > th { border-top: 1px solid rgba(26, 19, 56, 0.12); }
th { font-weight: 600; }
.x-icon { display: inline-block; flex: none; width: 48px; height: 48px; }
.x-connector { display: inline-block; flex: none; height: 24px; min-width: 24px; color: #8869CB; align-self: center; }
.x-shape { flex: none; }
.x-shape-ellipse { border-radius: 50%; }
.x-shape-diamond { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.x-shape-arrow-right { clip-path: polygon(0 30%, 60% 30%, 60% 0, 100% 50%, 60% 100%, 60% 70%, 0 70%); }
.x-shape-arrow-left { clip-path: polygon(100% 30%, 40% 30%, 40% 0, 0 50%, 40% 100%, 40% 70%, 100% 70%); }
.x-shape-arrow-down { clip-path: polygon(30% 0, 70% 0, 70% 60%, 100% 60%, 50% 100%, 0 60%, 30% 60%); }
.x-shape-arrow-up { clip-path: polygon(30% 100%, 70% 100%, 70% 40%, 100% 40%, 50% 0, 0 40%, 30% 40%); }
.x-shape-line { height: 0 !important; border-top: 4px solid currentColor; background: none !important; }
`;
