#!/usr/bin/env node
// KNOWLEDGE!B4SE extractor (KB-024, Nov 6).
// Turns saved artifact files into SQL that upserts kb_courses / kb_decks / kb_slides for one user.
// Run from a Claude chat: read each deck with the Artifact tool (it saves the files locally), list
// them in a manifest, then run:
//   node scripts/kb-extract.mjs <manifest.json> --json > kb-index.json   → send to Dan, KNOWLEDGE!B4SE → Import
// (or <user_id> instead of --json for a SQL file to run in Supabase). Re-runnable: rows are upserted by (deck url, slide id), and slides
// that were removed from a deck are deleted from the index.
// The manifest and the SQL hold Dan's content: keep both OUT of the repo (scratchpad only).
//
// Manifest: { "courses": [ { "domain", "program"?, "programSort"?, "course", "domainSort", "courseSort", "source",
//              "items": [ { "kind": "deck" | "sheet", "url", "dir", "title"?, "version"? } ] } ] }
//   deck  → dir holds project/deck.json + project/slides/<id>.html
//   sheet → dir holds project/canvas.json + project/<board>.dc.html
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------- text helpers ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', rarr: '→', larr: '←', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', times: '×', check: '✓' };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export function text(html) {
  return decode(
    html
      .replace(/<(script|style|helmet|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|h[1-6]|li|div|tr|td|th)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}
const first = (re, s) => {
  const m = re.exec(s);
  return m ? m[1] : '';
};

// ---------- secrets: never index keys, tokens or credential-looking strings ----------
const SECRET_PATTERNS = [
  /\bpk\.ey[A-Za-z0-9._-]{10,}/g, // Mapbox public token
  /\bsk\.ey[A-Za-z0-9._-]{10,}/g, // Mapbox secret token
  /\bcloudinary:\/\/\S+/gi, // Cloudinary URL with key + secret
  // key = value, only when the value looks like a real key (16+ characters with a digit), so code
  // like `apiKey: String` stays readable
  /\b(api[_-]?key|apikey|token|secret|password)\s*[=:]\s*['"]?(?=[A-Za-z0-9._\-]*\d)[A-Za-z0-9._\-]{16,}/gi,
  /\bsk-[A-Za-z0-9_-]{16,}/g, // generic secret-key prefix
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g // long random-looking strings
];
export function scrub(s, report) {
  let out = s;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, () => {
      report.count++;
      return '[removed]';
    });
  }
  return out;
}

// ---------- decks ----------
const SECTION_BY_PREFIX = [
  [/^(cover|o-)/, 'Overview'],
  [/^t-/, 'Key topics'],
  [/^a-/, 'Practice'],
  [/^r-/, 'Resources'],
  [/^x-/, 'AI Expansion']
];
function sectionName(description, startId) {
  const head = (description || '').split(':')[0].trim();
  if (head && head.length <= 24) return head;
  for (const [re, name] of SECTION_BY_PREFIX) if (re.test(startId)) return name;
  return '';
}
const DANS_WORK = /dan['’]s work/i;

export function parseSlide(html) {
  const notesRaw = text(first(/<aside\b[^>]*>([\s\S]*?)<\/aside>/i, html));
  const tagsAt = notesRaw.search(/Tags:\s*/i);
  const notes = (tagsAt >= 0 ? notesRaw.slice(0, tagsAt) : notesRaw).trim();
  const tags =
    tagsAt >= 0
      ? notesRaw
          .slice(tagsAt)
          .replace(/^Tags:\s*/i, '')
          .split(',')
          .map((t) => t.trim().replace(/\.$/, ''))
          .filter(Boolean)
      : [];
  const headingMatch = /<(h[12])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(html);
  const title = headingMatch ? text(headingMatch[2]) : '';
  // Eyebrow: the last <p> before the heading ("Key topic · Outcome 2", "AI Expansion · …").
  let eyebrow = '';
  if (headingMatch) {
    const before = html.slice(0, headingMatch.index);
    const ps = [...before.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
    if (ps.length) eyebrow = text(ps[ps.length - 1][1]);
  }
  // Body: what's on the slide, without the notes, and without the eyebrow and heading repeated at the start.
  let body = text(html.replace(/<aside\b[\s\S]*?<\/aside>/gi, ' '));
  for (const lead of [eyebrow, title]) if (lead && body.startsWith(lead)) body = body.slice(lead.length).trim();
  return { title, eyebrow, body, notes, tags };
}

export function extractDeck(item, report) {
  const deck = JSON.parse(readFileSync(join(item.dir, 'project/deck.json'), 'utf8'));
  const order = Array.isArray(deck.order) ? deck.order : [];
  const sections = Object.values(deck.sections || {})
    .map((s) => ({ name: sectionName(s.description, s.start), description: s.description || '', start: s.start, index: order.indexOf(s.start) }))
    .filter((s) => s.index >= 0)
    .sort((a, b) => a.index - b.index);
  const slides = [];
  order.forEach((id, i) => {
    const file = join(item.dir, 'project/slides', `${id}.html`);
    if (!existsSync(file)) {
      report.missing.push(`${item.url} · ${id}`);
      return;
    }
    const p = parseSlide(readFileSync(file, 'utf8'));
    const sec = [...sections].reverse().find((s) => s.index <= i);
    const tags = p.tags.map((t) => scrub(t, report));
    slides.push({
      slide_id: id,
      num: i + 1,
      section: sec ? sec.name : sectionName('', id),
      eyebrow: scrub(p.eyebrow, report),
      title: scrub(p.title || id, report),
      body: scrub(p.body, report),
      notes: scrub(p.notes, report),
      tags,
      is_dans_work: tags.some((t) => DANS_WORK.test(t)) || DANS_WORK.test(p.notes),
      link: `${item.url}#slide-${i + 1}`
    });
  });
  return {
    kind: 'deck',
    title: item.title || deck.title || item.url,
    url: item.url,
    version: item.version || null,
    sections: sections.map(({ name, description, start, index }) => ({ name, description, start, num: index + 1 })),
    slides
  };
}

// ---------- cheat-sheet canvases ----------
export function extractSheet(item, report) {
  const canvas = JSON.parse(readFileSync(join(item.dir, 'project/canvas.json'), 'utf8'));
  const order = Array.isArray(canvas.order) && canvas.order.length ? canvas.order : Object.keys(canvas.boards || {});
  const slides = [];
  order.forEach((file, i) => {
    const path = join(item.dir, 'project', file);
    if (!existsSync(path)) {
      report.missing.push(`${item.url} · ${file}`);
      return;
    }
    const html = readFileSync(path, 'utf8');
    const board = (canvas.boards || {})[file] || {};
    const title = (board.title || first(/<title>([\s\S]*?)<\/title>/i, html) || file).replace(/\s*·\s*Letter.*$/i, '').trim();
    const inner = first(/<x-dc>([\s\S]*?)<\/x-dc>/i, html) || html;
    const headings = [...inner.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi)].map((m) => text(m[1])).filter(Boolean);
    slides.push({
      slide_id: file.replace(/\.dc\.html$/, ''),
      num: i + 1,
      section: 'Cheat sheet',
      eyebrow: canvas.title || '',
      title: scrub(title, report),
      body: scrub(text(inner), report),
      notes: '',
      tags: ['cheat sheet', ...headings.map((h) => scrub(h, report))],
      is_dans_work: false,
      link: item.url
    });
  });
  return { kind: 'sheet', title: item.title || canvas.title || item.url, url: item.url, version: item.version || null, sections: [], slides };
}

// ---------- SQL ----------
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(q).join(',')}]::text[]`;

/** Reads every item in the manifest: { courses: [ { …course, decks: [ {kind,title,url,sort,sections,version,slides} ] } ], report }. */
export function build(manifest) {
  const report = { count: 0, missing: [], decks: 0, slides: 0 };
  const courses = (manifest.courses || []).map((c) => ({
    domain: c.domain,
    program: c.program ?? null,
    programSort: c.programSort | 0,
    course: c.course,
    domainSort: c.domainSort | 0,
    courseSort: c.courseSort | 0,
    source: c.source ?? null,
    decks: (c.items || []).map((item, sort) => {
      const d = item.kind === 'sheet' ? extractSheet(item, report) : extractDeck(item, report);
      report.decks++;
      report.slides += d.slides.length;
      return { ...d, sort };
    })
  }));
  return { courses, report };
}

/** The file the app's KNOWLEDGE!B4SE → Import reads (no user id: the app saves as whoever is signed in). */
export function toJson(manifest) {
  const { courses, report } = build(manifest);
  return { json: { kind: 'launchpage-kb-index', version: 1, generatedAt: new Date().toISOString(), courses }, report };
}

export function toSql(manifest, userId) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('user_id must be a uuid');
  const { courses, report } = build(manifest);
  const u = q(userId);
  const out = ['-- KNOWLEDGE!B4SE load (generated). Holds personal content: do not commit.', 'begin;'];
  for (const c of courses) {
    out.push(
      `insert into public.kb_courses (user_id, domain, program, program_sort, course, domain_sort, course_sort, source) values (${u}, ${q(c.domain)}, ${q(c.program)}, ${c.programSort}, ${q(c.course)}, ${c.domainSort}, ${c.courseSort}, ${q(c.source)})` +
        ` on conflict (user_id, domain, course) do update set program = coalesce(excluded.program, public.kb_courses.program), program_sort = excluded.program_sort, domain_sort = excluded.domain_sort, course_sort = excluded.course_sort, source = excluded.source;`
    );
    const courseId = `(select id from public.kb_courses where user_id = ${u} and domain = ${q(c.domain)} and course = ${q(c.course)})`;
    for (const d of c.decks) {
      out.push(
        `insert into public.kb_decks (user_id, course_id, kind, title, url, sort, sections, slide_count, version, extracted_at) values (${u}, ${courseId}, ${q(d.kind)}, ${q(d.title)}, ${q(d.url)}, ${d.sort}, ${q(JSON.stringify(d.sections))}::jsonb, ${d.slides.length}, ${q(d.version)}, now())` +
          ` on conflict (user_id, url) do update set course_id = excluded.course_id, kind = excluded.kind, title = excluded.title, sort = excluded.sort, sections = excluded.sections, slide_count = excluded.slide_count, version = excluded.version, extracted_at = now();`
      );
      const deckId = `(select id from public.kb_decks where user_id = ${u} and url = ${q(d.url)})`;
      const ids = d.slides.map((s) => q(s.slide_id)).join(',') || q('');
      out.push(`delete from public.kb_slides where deck_id = ${deckId} and slide_id not in (${ids});`);
      for (const s of d.slides) {
        out.push(
          `insert into public.kb_slides (user_id, deck_id, slide_id, num, section, eyebrow, title, body, notes, tags, tag_text, is_dans_work, link) values (${u}, ${deckId}, ${q(s.slide_id)}, ${s.num}, ${q(s.section)}, ${q(s.eyebrow)}, ${q(s.title)}, ${q(s.body)}, ${q(s.notes)}, ${arr(s.tags)}, ${q(s.tags.join(' '))}, ${s.is_dans_work}, ${q(s.link)})` +
            ` on conflict (deck_id, slide_id) do update set num = excluded.num, section = excluded.section, eyebrow = excluded.eyebrow, title = excluded.title, body = excluded.body, notes = excluded.notes, tags = excluded.tags, tag_text = excluded.tag_text, is_dans_work = excluded.is_dans_work, link = excluded.link;`
        );
      }
    }
  }
  out.push('commit;');
  return { sql: out.join('\n') + '\n', report };
}

// ---------- CLI ----------
//   node scripts/kb-extract.mjs <manifest.json> --json > kb-index.json      (for the app's Import)
//   node scripts/kb-extract.mjs <manifest.json> <user_id> > load.sql        (to run in Supabase)
if (import.meta.url === `file://${process.argv[1]}`) {
  const [manifestPath, target] = process.argv.slice(2);
  if (!manifestPath || !target) {
    console.error('usage: node scripts/kb-extract.mjs <manifest.json> (--json | <user_id>)');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { report, ...res } = target === '--json' ? toJson(manifest) : toSql(manifest, target);
  process.stdout.write(target === '--json' ? JSON.stringify(res.json) : res.sql);
  console.error(`decks/sheets: ${report.decks} · slides/pages: ${report.slides} · secrets removed: ${report.count}${report.missing.length ? ` · missing: ${report.missing.join('; ')}` : ''}`);
}
