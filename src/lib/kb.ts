import { supabase } from './supabase';

/**
 * KNOWLEDGE!B4SE (KB-025, Nov 6): Dan's course decks and cheat sheets, searchable.
 * The rows are written by Import (a kb-index.json made by scripts/kb-extract.mjs in a Claude chat).
 * The outline (no slide text) is also kept on this device so Browse and a basic search work offline.
 */

export type KbSection = { name: string; description: string; start: string; num: number };
export type KbCourse = { id: string; domain: string; course: string; domainSort: number; courseSort: number; source: string | null; program: string; programSort: number };
export type KbDeck = { id: string; courseId: string; kind: 'deck' | 'sheet'; title: string; url: string; sort: number; sections: KbSection[]; slideCount: number; extractedAt: string };
export type KbSlide = { id: string; deckId: string; slideId: string; num: number; section: string; eyebrow: string; title: string; tags: string[]; isDansWork: boolean; link: string };
export type KbOutline = { courses: KbCourse[]; decks: KbDeck[]; slides: KbSlide[] };
export type KbHit = KbSlide & { snippet: string; rank: number };

const LOCAL = 'launchpage.kb.outline.v1';
export const EMPTY_OUTLINE: KbOutline = { courses: [], decks: [], slides: [] };

export function cachedOutline(): KbOutline {
  try {
    const raw = localStorage.getItem(LOCAL);
    const o = raw ? (JSON.parse(raw) as KbOutline) : null;
    return o && Array.isArray(o.slides) ? o : EMPTY_OUTLINE;
  } catch {
    return EMPTY_OUTLINE;
  }
}
function keep(o: KbOutline) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify(o));
  } catch {
    /* storage full or blocked: the live copy still works */
  }
}

type CourseRow = { id: string; domain: string; course: string; domain_sort: number; course_sort: number; source: string | null; program: string | null; program_sort: number | null };
type DeckRow = { id: string; course_id: string; kind: 'deck' | 'sheet'; title: string; url: string; sort: number; sections: KbSection[] | null; slide_count: number; extracted_at: string };
type SlideRow = { id: string; deck_id: string; slide_id: string; num: number; section: string; eyebrow: string; title: string; tags: string[] | null; is_dans_work: boolean; link: string };

const slideFrom = (r: SlideRow): KbSlide => ({
  id: r.id,
  deckId: r.deck_id,
  slideId: r.slide_id,
  num: r.num,
  section: r.section,
  eyebrow: r.eyebrow,
  title: r.title,
  tags: r.tags ?? [],
  isDansWork: r.is_dans_work,
  link: r.link
});

/** Courses, decks and slide titles (not the slide text). Falls back to this device's copy. */
export async function loadOutline(): Promise<{ outline: KbOutline; offline: boolean; problem?: string }> {
  if (!supabase) return { outline: cachedOutline(), offline: true };
  const [c, d] = await Promise.all([
    supabase.from('kb_courses').select('id, domain, course, domain_sort, course_sort, source, program, program_sort').order('domain_sort').order('course_sort'),
    supabase.from('kb_decks').select('id, course_id, kind, title, url, sort, sections, slide_count, extracted_at').order('sort')
  ]);
  if (c.error || d.error) {
    const problem = (c.error ?? d.error)!.message;
    return { outline: cachedOutline(), offline: true, problem: /kb_courses|kb_decks|does not exist|schema cache/i.test(problem) ? 'Run supabase/migrations/0039_knowledge_base.sql first.' : problem };
  }
  // Slides: titles only (not the slide text), in pages, so a growing library never stops at the request limit.
  const rows: SlideRow[] = [];
  for (let from = 0; ; from += 1000) {
    const s = await supabase.from('kb_slides').select('id, deck_id, slide_id, num, section, eyebrow, title, tags, is_dans_work, link').order('deck_id').order('num').range(from, from + 999);
    if (s.error) return { outline: cachedOutline(), offline: true, problem: s.error.message };
    rows.push(...((s.data ?? []) as SlideRow[]));
    if ((s.data ?? []).length < 1000) break;
  }
  const outline: KbOutline = {
    courses: ((c.data ?? []) as CourseRow[]).map((r) => ({ id: r.id, domain: r.domain, course: r.course, domainSort: r.domain_sort, courseSort: r.course_sort, source: r.source, program: r.program ?? '', programSort: r.program_sort ?? 0 })),
    decks: ((d.data ?? []) as DeckRow[]).map((r) => ({ id: r.id, courseId: r.course_id, kind: r.kind, title: r.title, url: r.url, sort: r.sort, sections: Array.isArray(r.sections) ? r.sections : [], slideCount: r.slide_count, extractedAt: r.extracted_at })),
    slides: rows.map(slideFrom)
  };
  keep(outline);
  return { outline, offline: false };
}

/** Full-text search over titles, tags, slide text and notes; offline it searches titles and tags. */
export async function searchKb(q: string, outline: KbOutline): Promise<{ hits: KbHit[]; offline: boolean }> {
  const query = q.trim();
  if (!query) return { hits: [], offline: false };
  if (supabase) {
    const { data, error } = await supabase.rpc('kb_search', { q: query, max_rows: 150 });
    if (!error && Array.isArray(data)) {
      type HitRow = { slide_uuid: string; deck_id: string; slide_id: string; num: number; section: string; eyebrow: string; title: string; snippet: string; tags: string[] | null; is_dans_work: boolean; link: string; rank: number };
      return {
        hits: (data as HitRow[]).map((r) => ({
          ...slideFrom({ id: r.slide_uuid, deck_id: r.deck_id, slide_id: r.slide_id, num: r.num, section: r.section, eyebrow: r.eyebrow, title: r.title, tags: r.tags, is_dans_work: r.is_dans_work, link: r.link }),
          snippet: r.snippet ?? '',
          rank: r.rank
        })),
        offline: false
      };
    }
  }
  return { hits: localSearch(query, outline), offline: true };
}

/** Every word must appear in the title, eyebrow or tags (the last word as a prefix). */
export function localSearch(q: string, outline: KbOutline): KbHit[] {
  const words = q.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
  if (!words.length) return [];
  const hits: KbHit[] = [];
  for (const s of outline.slides) {
    const title = s.title.toLowerCase();
    const hay = `${title} ${s.eyebrow.toLowerCase()} ${s.tags.join(' ').toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const rank = words.reduce((n, w) => n + (title.includes(w) ? 2 : 0) + (s.tags.some((t) => t.toLowerCase() === w) ? 2 : 1), 0);
    hits.push({ ...s, snippet: '', rank });
  }
  return hits.sort((a, b) => b.rank - a.rank || a.num - b.num).slice(0, 150);
}

/** "the <<MVC>> pattern" → parts to render, with the matched words marked. */
export function snippetParts(snippet: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  const re = /<<([\s\S]*?)>>/g;
  let last = 0;
  for (let m = re.exec(snippet); m; m = re.exec(snippet)) {
    if (m.index > last) out.push({ text: snippet.slice(last, m.index), mark: false });
    out.push({ text: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) out.push({ text: snippet.slice(last), mark: false });
  return out;
}

// ---------- Import (kb-index.json from scripts/kb-extract.mjs) ----------

type IndexSlide = { slide_id: string; num: number; section: string; eyebrow: string; title: string; body: string; notes: string; tags: string[]; is_dans_work: boolean; link: string };
type IndexDeck = { kind: 'deck' | 'sheet'; title: string; url: string; sort: number; version: string | null; sections: KbSection[]; slides: IndexSlide[] };
type IndexCourse = { domain: string; program?: string; programSort?: number; course: string; domainSort: number; courseSort: number; source: string | null; decks: IndexDeck[] };
export type KbIndex = { kind: 'launchpage-kb-index'; version: number; generatedAt: string; courses: IndexCourse[] };

const ARTIFACT_URL = /^https:\/\/claude\.ai\/(artifact|code\/artifact)\/[A-Za-z0-9_-]+$/;

/** Checks the file is a KNOWLEDGE!B4SE index before anything is saved. */
export function readIndex(raw: unknown): KbIndex {
  const x = raw as KbIndex;
  if (!x || x.kind !== 'launchpage-kb-index' || !Array.isArray(x.courses)) throw new Error('That file isn’t a KNOWLEDGE!B4SE index (kb-index.json).');
  for (const c of x.courses) {
    if (!c.domain || !c.course || !Array.isArray(c.decks)) throw new Error('The index has a course without a domain, name or decks.');
    for (const d of c.decks) {
      if (!ARTIFACT_URL.test(d.url)) throw new Error(`“${d.title}” doesn’t point to a claude.ai artifact.`);
      if (!Array.isArray(d.slides)) throw new Error(`“${d.title}” has no slides.`);
      for (const s of d.slides) if (!s.link.startsWith(d.url)) throw new Error(`A slide in “${d.title}” links somewhere else.`);
    }
  }
  return x;
}

const CHUNK = 200;

/**
 * Saves the index: courses and decks are updated in place (by name and url), each deck's slides are
 * replaced by what's in the file (slides taken out of a deck leave the index). Decks not in the file
 * are left alone, so one course can be imported on its own.
 */
export async function importIndex(userId: string, index: KbIndex, progress: (msg: string) => void): Promise<{ courses: number; decks: number; slides: number }> {
  if (!supabase) throw new Error('Sign in to import: the knowledge base is saved to your account.');
  let decks = 0;
  let slides = 0;
  for (const c of index.courses) {
    const course = await supabase
      .from('kb_courses')
      .upsert(
        {
          user_id: userId,
          domain: c.domain,
          course: c.course,
          domain_sort: c.domainSort | 0,
          course_sort: c.courseSort | 0,
          source: c.source ?? null,
          // An older index has no program: leave the one already set.
          ...(c.program ? { program: c.program, program_sort: (c.programSort ?? 0) | 0 } : {})
        },
        { onConflict: 'user_id,domain,course' }
      )
      .select('id')
      .single();
    if (course.error) throw new Error(course.error.message);
    for (const d of c.decks) {
      progress(`Importing ${c.course} · ${d.title}…`);
      const deck = await supabase
        .from('kb_decks')
        .upsert(
          { user_id: userId, course_id: course.data.id, kind: d.kind, title: d.title, url: d.url, sort: d.sort | 0, sections: d.sections ?? [], slide_count: d.slides.length, version: d.version ?? null, extracted_at: new Date().toISOString() },
          { onConflict: 'user_id,url' }
        )
        .select('id')
        .single();
      if (deck.error) throw new Error(deck.error.message);
      const deckId = deck.data.id as string;
      const keepIds = d.slides.map((s) => `"${s.slide_id.replace(/"/g, '')}"`).join(',');
      const del = supabase.from('kb_slides').delete().eq('deck_id', deckId);
      const gone = keepIds ? await del.not('slide_id', 'in', `(${keepIds})`) : await del;
      if (gone.error) throw new Error(gone.error.message);
      for (let i = 0; i < d.slides.length; i += CHUNK) {
        const rows = d.slides.slice(i, i + CHUNK).map((s) => ({
          user_id: userId,
          deck_id: deckId,
          slide_id: s.slide_id,
          num: s.num,
          section: s.section ?? '',
          eyebrow: s.eyebrow ?? '',
          title: s.title ?? '',
          body: s.body ?? '',
          notes: s.notes ?? '',
          tags: s.tags ?? [],
          tag_text: (s.tags ?? []).join(' '),
          is_dans_work: !!s.is_dans_work,
          link: s.link
        }));
        const up = await supabase.from('kb_slides').upsert(rows, { onConflict: 'deck_id,slide_id' });
        if (up.error) throw new Error(up.error.message);
      }
      decks++;
      slides += d.slides.length;
    }
  }
  return { courses: index.courses.length, decks, slides };
}

// ---------- Shaping for the screens ----------

export type KbCourseNode = { course: KbCourse; decks: KbDeck[] };
export type KbProgramNode = { program: string; sort: number; source: string | null; courses: KbCourseNode[] };
export type KbDomainNode = { domain: string; sort: number; programs: KbProgramNode[]; courses: KbCourseNode[] };

/** Domain → program → course → decks (Dan, Nov 7), in library order. `courses` is the flat list. */
export function tree(o: KbOutline): KbDomainNode[] {
  const decksBy = new Map<string, KbDeck[]>();
  for (const d of o.decks) decksBy.set(d.courseId, [...(decksBy.get(d.courseId) ?? []), d]);
  const domains = new Map<string, KbDomainNode>();
  const sorted = [...o.courses].sort((a, b) => a.domainSort - b.domainSort || a.programSort - b.programSort || a.courseSort - b.courseSort);
  for (const c of sorted) {
    const dom = domains.get(c.domain) ?? { domain: c.domain, sort: c.domainSort, programs: [], courses: [] };
    const node = { course: c, decks: (decksBy.get(c.id) ?? []).sort((a, b) => a.sort - b.sort) };
    dom.courses.push(node);
    const name = c.program || c.course;
    let prog = dom.programs.find((x) => x.program === name);
    if (!prog) {
      prog = { program: name, sort: c.programSort, source: null, courses: [] };
      dom.programs.push(prog);
    }
    prog.courses.push(node);
    prog.source = prog.source ?? c.source;
    domains.set(c.domain, dom);
  }
  return [...domains.values()].sort((a, b) => a.sort - b.sort);
}

export function slidesOf(o: KbOutline, deckId: string) {
  return o.slides.filter((s) => s.deckId === deckId).sort((a, b) => a.num - b.num);
}

/** The order search filters offer sections in. */
export const SECTION_ORDER = ['Overview', 'Key topics', 'Practice', 'Resources', 'AI Expansion', 'Cheat sheet'];

// ---------- Topic page + Recently opened (wireframe rebuild, Nov 6) ----------

/** The slide's own text and notes, for the Dig deeper page. */
export async function slideDetail(id: string): Promise<{ body: string; notes: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('kb_slides').select('body, notes').eq('id', id).single();
  if (error || !data) return null;
  return { body: (data as { body: string }).body ?? '', notes: (data as { notes: string }).notes ?? '' };
}

/** Slides in other decks that share the most tags with this one ("Also appears in"). */
export function related(o: KbOutline, slide: KbSlide, max = 5): KbSlide[] {
  const generic = /^(overview|cover|key topics|divider|resources|ai|ai expansion|wrap|case study|learning outcomes|dan['’]s work|cheat sheet|full stack|ux|product management)$/i;
  const mine = new Set(slide.tags.filter((t) => !generic.test(t)).map((t) => t.toLowerCase()));
  if (!mine.size) return [];
  return o.slides
    .filter((s) => s.deckId !== slide.deckId)
    .map((s) => ({ s, n: s.tags.filter((t) => mine.has(t.toLowerCase())).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.s.num - b.s.num)
    .slice(0, max)
    .map((x) => x.s);
}

export type KbRecent = { id: string; title: string; where: string; link: string; at: string };
const RECENT = 'launchpage.kb.recent.v1';
export function recentList(): KbRecent[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT) ?? '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
export function remember(r: Omit<KbRecent, 'at'>) {
  try {
    const next = [{ ...r, at: new Date().toISOString() }, ...recentList().filter((x) => x.id !== r.id)].slice(0, 6);
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch {
    /* blocked storage: nothing to remember */
  }
}

/** Parent groups (Dan, Nov 6): the Home pills and the search scope. New courses join one by its domain. */
export const DOMAINS = ['Software Development', 'Marketing', 'Finance', 'CFA', 'MWD'];
