// KNOWLEDGE!B4SE extractor tests. Made-up decks only: node --test scripts/kb-extract.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractDeck, extractSheet, parseSlide, toSql, toJson, scrub } from './kb-extract.mjs';

function fakeDeck() {
  const dir = mkdtempSync(join(tmpdir(), 'kbdeck-'));
  mkdirSync(join(dir, 'project/slides'), { recursive: true });
  writeFileSync(
    join(dir, 'project/deck.json'),
    JSON.stringify({
      title: 'Test Course · Widgets',
      order: ['cover', 'o-why', 't-divider', 't-gears', 'a-mywork', 'r-resources', 'x-divider', 'x-done'],
      sections: {
        s1: { description: 'Overview: why widgets.', start: 'cover' },
        s2: { description: 'Key topics: gears and springs.', start: 't-divider' },
        s3: { description: 'Practice: the brief and my work.', start: 'a-mywork' },
        s4: { description: 'Resources: reading.', start: 'r-resources' },
        s5: { description: 'AI Expansion: widgets now.', start: 'x-divider' }
      }
    })
  );
  const slide = (id, eyebrow, h, body, notes) =>
    writeFileSync(
      join(dir, 'project/slides', `${id}.html`),
      `<section id="${id}" style="x"><p style="a">${eyebrow}</p><h2 style="b">${h}</h2><p>${body}</p><aside>${notes}</aside></section>`
    );
  slide('cover', 'Testing · Test Course', 'Widgets &amp; Gears', 'Learn widgets.', 'Cover. Tags: widgets, cover.');
  slide('o-why', 'Overview', 'Why it matters', 'Because.', 'Why. Tags: why.');
  slide('t-divider', 'Part 2', 'Key topics', '', 'Divider. Tags: divider.');
  slide('t-gears', 'Key topic · Outcome 2', 'Gears turn', 'Gear ratios with pk.eyFAKEFAKEFAKEFAKE123.abc inside.', 'From the source. apikey=abc123XYZ789def456 Tags: gears, ratios, Reenskaug.');
  slide('a-mywork', 'Practice · My work', 'My widget', 'What I built.', 'Dan’s own work. Tags: Dan’s work, widget.');
  slide('r-resources', 'Resources', 'Go deeper', 'Links.', 'Tags: resources.');
  slide('x-divider', 'Part 5', 'AI Expansion', '', 'Tags: AI.');
  slide('x-done', 'AI Expansion · Wrap', 'Done', 'Next module.', 'Tags: wrap.');
  return dir;
}

function fakeSheet() {
  const dir = mkdtempSync(join(tmpdir(), 'kbsheet-'));
  mkdirSync(join(dir, 'project'), { recursive: true });
  writeFileSync(
    join(dir, 'project/canvas.json'),
    JSON.stringify({ title: 'Test Cheat Sheets', boards: { 'A.dc.html': { title: 'Alpha · Letter landscape' }, 'B.dc.html': { title: 'Beta · Letter landscape' } }, order: ['A.dc.html', 'B.dc.html'] })
  );
  const board = (h) => `<!doctype html><html><head><title>t</title></head><body><x-dc><helmet><style>.c{}</style></helmet><div><h4>${h}</h4><p class="c">x = 1</p></div></x-dc><script>class C{}</script></body></html>`;
  writeFileSync(join(dir, 'project/A.dc.html'), board('Loops'));
  writeFileSync(join(dir, 'project/B.dc.html'), board('Hashes'));
  return dir;
}

test('slide parts: eyebrow, title, notes, tags, entities', () => {
  const p = parseSlide('<section><p>Key topic · Outcome 1</p><h2>A &amp; B</h2><p>Body</p><aside>Note here. Tags: one, two.</aside></section>');
  assert.equal(p.eyebrow, 'Key topic · Outcome 1');
  assert.equal(p.title, 'A & B');
  assert.equal(p.notes, 'Note here.');
  assert.deepEqual(p.tags, ['one', 'two']);
  assert.ok(!p.body.includes('Note here'), 'notes stay out of the body');
});

test('deck: sections, numbers, deep links, Dan’s work', () => {
  const report = { count: 0, missing: [] };
  const d = extractDeck({ url: 'https://claude.ai/artifact/TEST1', dir: fakeDeck() }, report);
  assert.equal(d.slides.length, 8);
  const by = Object.fromEntries(d.slides.map((s) => [s.slide_id, s]));
  assert.equal(by.cover.section, 'Overview');
  assert.equal(by['t-gears'].section, 'Key topics');
  assert.equal(by['a-mywork'].section, 'Practice');
  assert.equal(by['x-done'].section, 'AI Expansion');
  assert.equal(by['t-gears'].num, 4);
  assert.equal(by['t-gears'].link, 'https://claude.ai/artifact/TEST1#slide-4');
  assert.equal(by['a-mywork'].is_dans_work, true);
  assert.equal(by['t-gears'].is_dans_work, false);
  assert.deepEqual(by['t-gears'].tags, ['gears', 'ratios', 'Reenskaug']);
  assert.deepEqual(d.sections.map((s) => s.name), ['Overview', 'Key topics', 'Practice', 'Resources', 'AI Expansion']);
});

test('secrets never reach the index', () => {
  const report = { count: 0, missing: [] };
  const d = extractDeck({ url: 'https://claude.ai/artifact/TEST1', dir: fakeDeck() }, report);
  const g = d.slides.find((s) => s.slide_id === 't-gears');
  assert.ok(!g.body.includes('pk.ey'), 'token removed from body');
  assert.ok(!g.notes.includes('abc123XYZ789def456'), 'key removed from notes');
  assert.ok(report.count >= 2);
  const r = { count: 0 };
  assert.equal(scrub('cloudinary://123:abc@demo', r), '[removed]');
  assert.equal(scrub('plain words stay', r), 'plain words stay');
  assert.equal(scrub('static values = { apiKey: String }', r), 'static values = { apiKey: String }');
});

test('sheet: one row per board, headings become tags', () => {
  const report = { count: 0, missing: [] };
  const s = extractSheet({ url: 'https://claude.ai/artifact/SHEET', dir: fakeSheet() }, report);
  assert.equal(s.kind, 'sheet');
  assert.deepEqual(s.slides.map((x) => x.title), ['Alpha', 'Beta']);
  assert.ok(s.slides[0].tags.includes('Loops'));
  assert.ok(!s.slides[0].body.includes('class C'), 'scripts stay out');
});

test('SQL: upserts, removes dropped slides, escapes quotes, needs a uuid', () => {
  const manifest = {
    courses: [{ domain: 'Testing', course: "Dan's Test", domainSort: 1, courseSort: 1, items: [{ kind: 'deck', url: 'https://claude.ai/artifact/TEST1', dir: fakeDeck() }, { kind: 'sheet', url: 'https://claude.ai/artifact/SHEET', dir: fakeSheet() }] }]
  };
  const { sql, report } = toSql(manifest, '00000000-0000-0000-0000-000000000000');
  assert.equal(report.decks, 2);
  assert.equal(report.slides, 10);
  assert.match(sql, /'Dan''s Test'/);
  assert.match(sql, /delete from public\.kb_slides where deck_id = .* and slide_id not in \(/);
  assert.match(sql, /on conflict \(deck_id, slide_id\) do update/);
  assert.ok(sql.startsWith('-- KNOWLEDGE!B4SE load') && sql.trim().endsWith('commit;'));
  assert.throws(() => toSql(manifest, "x'; drop table"), /uuid/);
});

test('JSON index for the app: courses → decks → slides, no user id', () => {
  const manifest = { courses: [{ domain: 'Testing', course: 'Widgets', domainSort: 2, courseSort: 3, items: [{ kind: 'deck', url: 'https://claude.ai/artifact/TEST1', dir: fakeDeck() }] }] };
  const { json, report } = toJson(manifest);
  assert.equal(json.kind, 'launchpage-kb-index');
  assert.equal(json.courses[0].decks[0].slides.length, 8);
  assert.equal(json.courses[0].decks[0].sort, 0);
  assert.equal(report.slides, 8);
  assert.ok(!JSON.stringify(json).includes('user_id'));
});
