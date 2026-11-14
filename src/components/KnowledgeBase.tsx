import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SlideViewer } from './SlideViewer';
import {
  DOMAINS,
  SECTION_ORDER,
  cachedOutline,
  importIndex,
  loadOutline,
  readIndex,
  recentList,
  related,
  remember,
  searchKb,
  slideDetail,
  slidesOf,
  snippetParts,
  tree,
  type KbCourse,
  type KbDeck,
  type KbHit,
  type KbOutline,
  type KbSlide
} from '../lib/kb';

/**
 * KNOWLEDGE!B4SE (Nov 6, rebuilt from the "Knowledge Base Wireframe" canvas at Dan's ask):
 * a white page of its own. Home (search) → Results (with a preview) → Dig deeper (topic page),
 * and Browse as the way in when you don't know what to search for. Open at slide opens the deck.
 */
type Screen = { kind: 'home' } | { kind: 'results' } | { kind: 'topic'; slideId: string; back: 'results' | 'browse' | 'home' } | { kind: 'browse'; courseId: string | null; domain?: string };
type Props = { userId: string | null; onStatus: (msg: string) => void };

export function KnowledgeBasePage({ userId, onStatus }: Props) {
  const [outline, setOutline] = useState<KbOutline>(cachedOutline);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  const [offline, setOffline] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const [importing, setImporting] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  // ⚙ → Import knowledge base opens the file picker.
  useEffect(() => {
    const open = () => pick.current?.click();
    window.addEventListener('kb:import', open);
    return () => window.removeEventListener('kb:import', open);
  }, []);

  async function refresh() {
    const r = await loadOutline();
    setOutline(r.outline);
    setOffline(r.offline);
    setProblem(r.problem ?? '');
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  function go(s: Screen) {
    setScreen(s);
    top.current?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }

  async function onImport(f: File) {
    if (!userId) return onStatus('Sign in to import: the knowledge base is saved to your account.');
    try {
      const index = readIndex(JSON.parse(await f.text()));
      const r = await importIndex(userId, index, setImporting);
      setImporting('');
      await refresh();
      onStatus(`KNOWLEDGE B4SE: ${r.slides} slides from ${r.decks} decks in ${r.courses} courses imported.`);
    } catch (err) {
      setImporting('');
      onStatus(`KNOWLEDGE B4SE import stopped: ${(err as Error).message}`);
    }
  }

  const ctx = useMemo(() => {
    const deckById = new Map(outline.decks.map((d) => [d.id, d]));
    const courseById = new Map(outline.courses.map((c) => [c.id, c]));
    const slideById = new Map(outline.slides.map((s) => [s.id, s]));
    return { deckById, courseById, slideById };
  }, [outline]);

  const [viewer, setViewer] = useState<{ deck: KbDeck; num: number } | null>(null);
  const view = useCallback((deck: KbDeck, num: number) => setViewer({ deck, num }), []);

  /** Opening a slide: remembered for Recently opened. */
  function opened(s: KbSlide) {
    const d = ctx.deckById.get(s.deckId);
    const c = d && ctx.courseById.get(d.courseId);
    remember({ id: s.id, title: s.title, where: `${c?.course ?? ''} · ${d?.title ?? ''} · ${d?.kind === 'sheet' ? 'page' : 'slide'} ${s.num}`, link: s.link });
  }

  const importer = (
    <label className="kb-link kb-import" title="Import a knowledge base index (kb-index.json)">
      ↓ Import kb-index.json
      <input
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = '';
        }}
      />
    </label>
  );

  let body: ReactNode;
  if (!loading && !outline.slides.length) {
    body = (
      <Home q={q} setQ={setQ} domain={domain} setDomain={setDomain} outline={outline} onSearch={() => go({ kind: 'results' })} onBrowse={(id) => go({ kind: 'browse', courseId: id })} importer={importer}>
        <p className="kb-empty">
          Your course decks show up here once they’re imported. {importer} (also in ⚙). Importing again later updates what changed.
        </p>
      </Home>
    );
  } else if (screen.kind === 'results') {
    body = (
      <Results
        q={q}
        setQ={setQ}
        domain={domain}
        setDomain={setDomain}
        outline={outline}
        ctx={ctx}
        onHome={() => go({ kind: 'home' })}
        onBrowse={() => go({ kind: 'browse', courseId: null })}
        onTopic={(id) => go({ kind: 'topic', slideId: id, back: 'results' })}
        onOpen={opened}
      />
    );
  } else if (screen.kind === 'topic') {
    const s = ctx.slideById.get(screen.slideId);
    body = s ? (
      <Topic
        slide={s}
        outline={outline}
        ctx={ctx}
        back={screen.back}
        onBack={() => go(screen.back === 'results' ? { kind: 'results' } : screen.back === 'browse' ? { kind: 'browse', courseId: ctx.deckById.get(s.deckId)?.courseId ?? null } : { kind: 'home' })}
        onHome={() => go({ kind: 'home' })}
        onTopic={(id) => go({ kind: 'topic', slideId: id, back: screen.back })}
        onBrowse={(courseId) => go({ kind: 'browse', courseId })}
        onTag={(t) => {
          setQ(t);
          go({ kind: 'results' });
        }}
        onOpen={opened}
      />
    ) : null;
  } else if (screen.kind === 'browse') {
    body = (
      <Browse
        key={`${screen.domain ?? ''}|${screen.courseId ?? ''}`}
        outline={outline}
        openCourse={screen.courseId}
        domain={screen.domain ?? ''}
        onDomain={(d) => {
          setDomain(d);
          go({ kind: 'browse', courseId: null, domain: d });
        }}
        q={q}
        setQ={setQ}
        onSearch={() => {
          setDomain(screen.domain ?? '');
          go({ kind: 'results' });
        }}
        onHome={() => go({ kind: 'home' })}
        onTopic={(id) => go({ kind: 'topic', slideId: id, back: 'browse' })}
      />
    );
  } else {
    body = (
      <Home
        q={q}
        setQ={setQ}
        domain={domain}
        setDomain={setDomain}
        outline={outline}
        onSearch={() => go({ kind: 'results' })}
        onBrowse={(id) => go({ kind: 'browse', courseId: id })}
        onDomain={(d) => {
          setDomain(d);
          go({ kind: 'browse', courseId: null, domain: d });
        }}
        importer={importer}
        recent={recentList()}
        onRecent={(id) => {
          const s = ctx.slideById.get(id);
          if (s) go({ kind: 'topic', slideId: id, back: 'home' });
        }}
      />
    );
  }

  return (
    <ViewerCtx.Provider value={view}>
    <div className="kb" ref={top}>
      <input
        ref={pick}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import a knowledge base index"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = '';
        }}
      />
      {(importing || problem || (offline && outline.slides.length > 0)) && (
        <p className={`kb-note${problem ? ' kb-problem' : ''}`} role="status">
          {importing || problem || 'Offline: searching titles and tags from this device’s copy.'}
        </p>
      )}
      {body}
      {viewer && createPortal(<SlideViewer deck={viewer.deck} start={viewer.num} onClose={() => setViewer(null)} />, document.body)}
    </div>
    </ViewerCtx.Provider>
  );
}

type Ctx = { deckById: Map<string, KbDeck>; courseById: Map<string, KbCourse>; slideById: Map<string, KbSlide> };

/** Opens a deck at a slide: in the app's viewer when the deck is stored here (hosted), else on claude.ai. */
const ViewerCtx = createContext<(deck: KbDeck, num: number) => void>(() => undefined);

function OpenLink({ deck, num, slide, className, onOpen, children }: { deck: KbDeck; num?: number; slide?: KbSlide; className: string; onOpen?: (s: KbSlide) => void; children: ReactNode }) {
  const view = useContext(ViewerCtx);
  const n = num ?? slide?.num ?? 1;
  if (deck.hosted && deck.kind === 'deck') {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          if (slide) onOpen?.(slide);
          view(deck, n);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <a className={className} href={slide ? slide.link : num ? `${deck.url}#slide-${num}` : deck.url} target="_blank" rel="noopener noreferrer" onClick={() => slide && onOpen?.(slide)}>
      {children}
    </a>
  );
}

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

function SearchBox({ q, setQ, onSubmit, big, autoFocus }: { q: string; setQ: (v: string) => void; onSubmit: () => void; big?: boolean; autoFocus?: boolean }) {
  return (
    <div className={`kb-searchrow${big ? ' is-big' : ''}`}>
      <form
        role="search"
        className="kb-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label className="sr-only" htmlFor={big ? 'kb-q' : 'kb-q2'}>
          Search the knowledge base
        </label>
        <input id={big ? 'kb-q' : 'kb-q2'} type="search" value={q} autoFocus={autoFocus} autoComplete="off" spellCheck={false} placeholder="Search." onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="kb-go" aria-label="Search">
          <SearchIcon />
        </button>
      </form>
    </div>
  );
}

/**
 * Inner pages (Dan, Nov 6): the wordmark and the page title sit up top above the menu, where the
 * Launch Page has its logo, headline and mantra. Rendered into the slim header's slot.
 */
function Masthead({ title, sub, onHome, right }: { title: string; sub?: string; onHome: () => void; right?: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('kb-topbar-slot')), []);
  const content = (
    <div className="kb-mast">
      <Wordmark small onHome={onHome} />
      <div className="kb-mast-words">
        <p className="kb-mast-title">{title}</p>
        {sub && <p className="kb-mast-sub">{sub}</p>}
      </div>
      {/* Inner pages (Dan, Nov 6): the search sits up top beside the title. */}
      {right && <div className="kb-mast-right">{right}</div>}
    </div>
  );
  return slot ? createPortal(content, slot) : null;
}

function Wordmark({ onHome, small }: { onHome?: () => void; small?: boolean }) {
  const img = <img src="/knowledge-b4se.png" alt="KNOWLEDGE B4SE" className={small ? 'kb-mark-sm' : 'kb-mark'} />;
  return onHome ? (
    <button type="button" className="kb-mark-btn" onClick={onHome} title="KNOWLEDGE B4SE home">
      {img}
    </button>
  ) : (
    img
  );
}

function deckCountLabel(decks: KbDeck[]) {
  const n = decks.filter((d) => d.kind === 'deck').length;
  const sheets = decks.some((d) => d.kind === 'sheet');
  return [n ? `${n} ${n === 1 ? 'deck' : 'decks'}` : '', sheets ? 'cheat sheets' : ''].filter(Boolean).join(' + ');
}

// ---------- 1 · Home ----------

function Home(p: {
  q: string;
  setQ: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  outline: KbOutline;
  onSearch: () => void;
  onBrowse: (courseId: string | null) => void;
  onDomain?: (domain: string) => void;
  importer: ReactNode;
  recent?: { id: string; title: string; where: string; link: string }[];
  onRecent?: (id: string) => void;
  children?: ReactNode;
}) {
  const domains = tree(p.outline);
  const programs = domains.flatMap((d) => d.programs.map((pg) => ({ ...pg, domain: d.domain })));
  return (
    <div className="kb-home">
      <div className="kb-hero">
        {/* Dan's original wireframe: the bar is as wide as the wordmark, starts a third of the way in and overhangs a third. */}
        <div className="kb-lockup">
          <Wordmark />
          <SearchBox q={p.q} setQ={p.setQ} onSubmit={() => p.q.trim() && p.onSearch()} big autoFocus />
        </div>
      </div>
      <div className="kb-pills kb-domains" role="group" aria-label="Search">
        {['', ...DOMAINS].map((d) => (
          <button key={d || 'all'} type="button" className="kb-pill" aria-pressed={p.domain === d} onClick={() => (p.onDomain ? p.onDomain(d) : p.setDomain(d))}>
            {d || 'All'}
          </button>
        ))}
      </div>
      {p.children}
      <div className="kb-home-cards">
        <section className="kb-card">
          <div className="kb-card-head">
            <h2>Programs</h2>
            {programs.length > 0 && (
              <button type="button" className="kb-link" onClick={() => p.onBrowse(null)}>
                {programs.length > 3 ? `Browse all ${programs.length}` : 'Browse all'}
              </button>
            )}
          </div>
          {programs.length ? (
            programs.slice(0, 3).map((pg) => {
              const decks = pg.courses.flatMap((c) => c.decks);
              return (
                <button key={`${pg.domain}|${pg.program}`} type="button" className="kb-row" onClick={() => p.onBrowse(pg.courses[0].course.id)}>
                  <span className="kb-row-left">
                    <b>{pg.program}</b>
                  </span>
                  <span className="kb-row-right">
                    {pg.courses.length} {pg.courses.length === 1 ? 'course' : 'courses'} · {deckCountLabel(decks)}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="kb-dim">No courses yet.</p>
          )}
        </section>
        <section className="kb-card">
          <div className="kb-card-head">
            <h2>Recently opened</h2>
          </div>
          {p.recent && p.recent.length ? (
            p.recent.slice(0, 3).map((r) => (
              <button key={r.id} type="button" className="kb-row kb-row-stack" onClick={() => p.onRecent?.(r.id)}>
                <span className="kb-row-left">
                  <b>{r.title}</b>
                </span>
                <span className="kb-mono kb-row-where">{r.where}</span>
              </button>
            ))
          ) : (
            <p className="kb-dim">Slides you open show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- 2 · Results ----------

const FILTERS: { id: string; label: string; test: (h: KbHit, deck?: KbDeck) => boolean }[] = [
  { id: '', label: 'All', test: () => true },
  ...SECTION_ORDER.filter((s) => s !== 'Cheat sheet').map((s) => ({ id: s, label: s, test: (h: KbHit) => h.section === s })),
  { id: 'sheets', label: 'Cheat sheets', test: (_h: KbHit, d?: KbDeck) => d?.kind === 'sheet' },
  { id: 'dan', label: 'Dan’s work', test: (h: KbHit) => h.isDansWork }
];

function Results(p: {
  q: string;
  setQ: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  outline: KbOutline;
  ctx: Ctx;
  onHome: () => void;
  onBrowse: () => void;
  onTopic: (id: string) => void;
  onOpen: (s: KbSlide) => void;
}) {
  const [hits, setHits] = useState<KbHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(30);
  const [preview, setPreview] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = p.q.trim();
    const n = ++seq.current;
    if (!term) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchKb(term, p.outline);
      if (n !== seq.current) return; // a newer search is on its way
      setHits(r.hits);
      setSearching(false);
      setShown(30);
      setPreview(null);
    }, 180);
    return () => clearTimeout(t);
  }, [p.q, p.outline]);

  const inCourse = hits.filter((h) => {
    const d = p.ctx.deckById.get(h.deckId);
    return !!d && (!p.domain || p.ctx.courseById.get(d.courseId)?.domain.toLowerCase() === p.domain.toLowerCase());
  });
  const counts = FILTERS.map((f) => ({ ...f, n: inCourse.filter((h) => f.test(h, p.ctx.deckById.get(h.deckId))).length }));
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const list = inCourse.filter((h) => active.test(h, p.ctx.deckById.get(h.deckId)));
  const current = list.find((h) => h.id === preview) ?? list[0];

  return (
    <div className="kb-page">
      <Masthead
        title="Search"
        sub={p.q.trim() ? `“${p.q.trim()}”` : 'every lesson, slide and cheat sheet'}
        onHome={p.onHome}
        right={
          <>
            <SearchBox q={p.q} setQ={p.setQ} onSubmit={() => undefined} autoFocus />
            <button type="button" className="kb-link" onClick={p.onBrowse}>
              Browse
            </button>
          </>
        }
      />
      <div className="kb-pills kb-filters">
        {counts
          .filter((f) => f.id === '' || f.n > 0 || f.id === filter)
          .map((f) => (
            <button key={f.id || 'all'} type="button" className="kb-pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} · {f.n}
            </button>
          ))}
        <label className="kb-course-pick">
          <span className="sr-only">Search in</span>
          <select value={p.domain} onChange={(e) => p.setDomain(e.target.value)}>
            <option value="">All</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="kb-split">
        <section className="kb-results" aria-label="Results">
          <p className="kb-count" role="status">
            {!p.q.trim()
              ? 'Type to search every lesson, slide and cheat sheet.'
              : searching
                ? 'Searching…'
                : list.length
                  ? `${list.length} ${list.length === 1 ? 'result' : 'results'} for “${p.q.trim()}”`
                  : inCourse.length
                    ? 'Nothing with this filter. Pick All to see the rest.'
                    : hits.length && p.domain
                      ? `Nothing in ${p.domain} matches. Pick All to search everything.`
                      : 'No slides match. Try fewer or shorter words.'}
          </p>
          {list.slice(0, shown).map((h, i) => {
            const d = p.ctx.deckById.get(h.deckId)!;
            const c = p.ctx.courseById.get(d.courseId);
            const parts = snippetParts(h.snippet);
            const sheet = d.kind === 'sheet';
            return (
              <article
                key={h.id}
                className={`kb-result${i === 0 ? ' is-top' : ''}${current?.id === h.id ? ' is-previewed' : ''}`}
                onMouseEnter={() => setPreview(h.id)}
                onFocus={() => setPreview(h.id)}
              >
                <p className="kb-crumb">
                  {c?.course} › {d.title} › {sheet ? 'Page' : 'Slide'} {h.num}
                </p>
                <h2>
                  <button type="button" className="kb-title-btn" onClick={() => p.onTopic(h.id)}>
                    {h.title}
                  </button>
                  {h.isDansWork && <span className="kb-badge">Dan’s work</span>}
                </h2>
                <p className="kb-meta">{metaOf(h)}</p>
                {parts.length > 0 && (
                  <p className="kb-snip">{parts.map((x, j) => (x.mark ? <mark key={j}>{x.text}</mark> : <span key={j}>{x.text}</span>))}</p>
                )}
                <div className="kb-actions">
                  <OpenLink className="kb-btn kb-btn-dark" deck={d} slide={h} onOpen={p.onOpen}>
                    {sheet ? 'Open cheat sheets' : `Open at slide ${h.num}`}
                  </OpenLink>
                  {!sheet && (
                    <OpenLink className="kb-btn" deck={d} num={1}>
                      Open deck
                    </OpenLink>
                  )}
                  <button type="button" className="kb-btn" onClick={() => p.onTopic(h.id)}>
                    Dig deeper →
                  </button>
                </div>
              </article>
            );
          })}
          {list.length > shown && (
            <button type="button" className="kb-btn kb-more" onClick={() => setShown((n) => n + 30)}>
              Show more ({list.length - shown})
            </button>
          )}
        </section>
        {current && <Preview hit={current} ctx={p.ctx} onOpen={p.onOpen} />}
      </div>
    </div>
  );
}

/** "Key topic · Outcome 3", or the section when the eyebrow is a cover breadcrumb or "Part 2 of 4". */
function metaOf(s: { slideId: string; section: string; eyebrow: string }) {
  if (s.slideId === 'cover') return `${s.section || 'Overview'} · Cover`;
  if (!s.eyebrow || /^part \d/i.test(s.eyebrow)) return s.section;
  return s.eyebrow;
}

function Preview({ hit, ctx, onOpen }: { hit: KbHit; ctx: Ctx; onOpen: (s: KbSlide) => void }) {
  const d = ctx.deckById.get(hit.deckId);
  const tags = hit.tags.filter((t) => !/dan['’]s work|cheat sheet/i.test(t)).slice(0, 4);
  return (
    <aside className="kb-preview" aria-label="Preview">
      <p className="kb-eyebrow">Preview</p>
      <div className="kb-slide">
        <p className="kb-slide-eyebrow">{metaOf(hit)}</p>
        <p className="kb-slide-title">{hit.title}</p>
        {tags.length > 0 && (
          <div className="kb-slide-tags">
            {tags.map((t, i) => (
              <span key={t} className={i === tags.length - 1 && tags.length > 1 ? 'is-last' : ''}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="kb-dim">
        {d?.title} · {d?.kind === 'sheet' ? 'page' : 'slide'} {hit.num}
        {d && d.kind === 'deck' ? ` of ${d.slideCount}` : ''}
      </p>
      {d ? (
        <OpenLink className="kb-btn kb-btn-dark kb-btn-block" deck={d} slide={hit} onOpen={onOpen}>
          Open this slide
        </OpenLink>
      ) : (
        <a className="kb-btn kb-btn-dark kb-btn-block" href={hit.link} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(hit)}>
          Open this slide
        </a>
      )}
    </aside>
  );
}

// ---------- 3 · Dig deeper (topic page) ----------

function Topic(p: {
  slide: KbSlide;
  outline: KbOutline;
  ctx: Ctx;
  back: 'results' | 'browse' | 'home';
  onBack: () => void;
  onHome: () => void;
  onTopic: (id: string) => void;
  onBrowse: (courseId: string) => void;
  onTag: (t: string) => void;
  onOpen: (s: KbSlide) => void;
}) {
  const s = p.slide;
  const d = p.ctx.deckById.get(s.deckId)!;
  const c = p.ctx.courseById.get(d.courseId);
  const [detail, setDetail] = useState<{ body: string; notes: string } | null>(null);
  useEffect(() => {
    let live = true;
    setDetail(null);
    void slideDetail(s.id).then((r) => live && setDetail(r));
    return () => {
      live = false;
    };
  }, [s.id]);
  useEffect(() => p.onOpen(s), [s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckSlides = slidesOf(p.outline, d.id);
  const sameSection = deckSlides.filter((x) => x.section === s.section);
  // Up to 6 slides of this section, centred on this one.
  const at = sameSection.findIndex((x) => x.id === s.id);
  const from = Math.max(0, Math.min(at - 2, sameSection.length - 6));
  const around = sameSection.slice(from, from + 6);
  const sections: { name: string; slides: KbSlide[] }[] = [];
  for (const x of deckSlides) {
    const last = sections[sections.length - 1];
    if (last && last.name === x.section) last.slides.push(x);
    else sections.push({ name: x.section, slides: [x] });
  }
  const also = related(p.outline, s);
  const tags = s.tags.filter((t) => !/dan['’]s work/i.test(t));
  const summary = detail?.body ? (detail.body.length > 420 ? `${detail.body.slice(0, 420).replace(/\s+\S*$/, '')}…` : detail.body) : '';
  const sheet = d.kind === 'sheet';

  return (
    <div className="kb-page">
      <Masthead title={d.title} sub={c?.course} onHome={p.onHome} />
      <div className="kb-bar">
        <nav aria-label="Breadcrumb" className="kb-crumbs">
          {c && (
            <button type="button" className="kb-link" onClick={() => p.onBrowse(c.id)}>
              {c.course}
            </button>
          )}
          <span aria-hidden="true">›</span>
          <OpenLink className="kb-link" deck={d} num={1}>
            {d.title}
          </OpenLink>
          <span aria-hidden="true">›</span>
          <span className="kb-crumb-here">{s.title}</span>
        </nav>
        <button type="button" className="kb-link kb-bar-end" onClick={p.onBack}>
          ← Back to {p.back}
        </button>
      </div>
      <div className="kb-split">
        <div className="kb-topic-main">
          <div className="kb-topic-head">
            <p className="kb-eyebrow">
              {metaOf(s)}
              {s.isDansWork && <span className="kb-badge">Dan’s work</span>}
            </p>
            <h1>{s.title}</h1>
            {summary ? <p className="kb-lead">{summary}</p> : detail === null ? <p className="kb-lead kb-dim">Loading…</p> : null}
            <div className="kb-actions">
              <OpenLink className="kb-btn kb-btn-dark" deck={d} slide={s} onOpen={p.onOpen}>
                {sheet ? 'Open cheat sheets' : `Open deck at slide ${s.num}`}
              </OpenLink>
              {!sheet && (
                <OpenLink className="kb-btn" deck={d} num={1}>
                  Open full deck
                </OpenLink>
              )}
            </div>
          </div>
          {around.length > 1 && (
            <section className="kb-block" aria-labelledby="kb-around">
              <h2 id="kb-around">{s.section ? `${s.section} in this deck` : 'Around this slide'}</h2>
              <div className="kb-thumbs">
                {around.map((x) => (
                  <button key={x.id} type="button" className={`kb-thumb${x.id === s.id ? ' is-here' : ''}`} onClick={() => p.onTopic(x.id)} aria-current={x.id === s.id || undefined}>
                    <span className="kb-thumb-card">
                      <span>{x.title}</span>
                    </span>
                    <span className="kb-mono">
                      {sheet ? 'Page' : 'Slide'} {x.num}
                      {metaOf(x) !== x.section ? ` · ${metaOf(x).replace(/^Key topic · /, '')}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {detail?.notes && (
            <section className="kb-card kb-notes" aria-labelledby="kb-notes-h">
              <h2 id="kb-notes-h">Notes</h2>
              <p>{detail.notes}</p>
            </section>
          )}
        </div>
        <aside className="kb-topic-side">
          <section className="kb-card kb-card-beige">
            <h2>{d.title}</h2>
            {sections.map((sec, i) => (
              <div key={`${sec.name}-${i}`} className="kb-side-sec">
                <p className="kb-side-name">{sec.name || 'Slides'}</p>
                {sec.slides.map((x) => (
                  <button key={x.id} type="button" className={`kb-side-item${x.id === s.id ? ' is-here' : ''}`} aria-current={x.id === s.id ? 'page' : undefined} onClick={() => p.onTopic(x.id)}>
                    <span className="kb-mono">{x.num}</span> {x.title}
                  </button>
                ))}
              </div>
            ))}
          </section>
          {(also.length > 0 || tags.length > 0) && (
            <section className="kb-card">
              {also.length > 0 && (
                <>
                  <h2>Also appears in</h2>
                  {also.map((x) => {
                    const xd = p.ctx.deckById.get(x.deckId);
                    return (
                      <button key={x.id} type="button" className="kb-link kb-also" onClick={() => p.onTopic(x.id)}>
                        {xd?.title} · {x.title}
                      </button>
                    );
                  })}
                </>
              )}
              {tags.length > 0 && (
                <>
                  <h2 className={also.length ? 'kb-gap' : ''}>Tags</h2>
                  <div className="kb-tags">
                    {tags.map((t) => (
                      <button key={t} type="button" className="kb-tag" onClick={() => p.onTag(t)} title={`Search “${t}”`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- 5 · Browse ----------

function Browse({
  outline,
  openCourse,
  domain,
  onDomain,
  q,
  setQ,
  onSearch,
  onHome,
  onTopic
}: {
  outline: KbOutline;
  openCourse: string | null;
  domain: string;
  onDomain: (d: string) => void;
  q: string;
  setQ: (v: string) => void;
  onSearch: () => void;
  onHome: () => void;
  onTopic: (id: string) => void;
}) {
  // A group pill (Dan, Nov 6) opens just that group's courses; ALL shows everything.
  const domains = tree(outline).filter((d) => !domain || d.domain.toLowerCase() === domain.toLowerCase());
  const first = openCourse ?? domains[0]?.courses[0]?.course.id ?? null;
  const groupCourses = domains.flatMap((d) => d.courses);
  const nPrograms = domains.reduce((n, d) => n + d.programs.length, 0);
  const groupDecks = groupCourses.flatMap((c) => c.decks);
  const nDecks = groupDecks.filter((d) => d.kind === 'deck').length;
  const nSlides = groupDecks.reduce((n, d) => n + d.slideCount, 0);
  const counts = groupCourses.length
    ? `${nPrograms} ${nPrograms === 1 ? 'program' : 'programs'} · ${groupCourses.length} ${groupCourses.length === 1 ? 'course' : 'courses'} · ${nDecks} ${nDecks === 1 ? 'deck' : 'decks'} · ${nSlides} slides`
    : 'Nothing imported yet';
  const [open, setOpen] = useState<Set<string>>(() => new Set(first ? [first] : []));
  const [deckOpen, setDeckOpen] = useState<string | null>(null);
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="kb-page">
      {/* Searching from a group page searches just that group. */}
      <Masthead title={domain || 'Browse'} sub={counts} onHome={onHome} right={<SearchBox q={q} setQ={setQ} onSubmit={() => q.trim() && onSearch()} />} />
      <div className="kb-pills kb-domains kb-browse-pills" role="group" aria-label="Group">
        {['', ...DOMAINS].map((d) => (
          <button key={d || 'all'} type="button" className="kb-pill" aria-pressed={domain === d} onClick={() => onDomain(d)}>
            {d || 'All'}
          </button>
        ))}
      </div>
      <div className="kb-browse">
        {domains.length === 0 && <p className="kb-empty kb-browse-empty">Nothing in {domain} yet. Its courses show up here once they’re imported.</p>}
        {domains.map((dom) => (
          <div key={dom.domain} className="kb-domain">
            {!domain && <h2 className="kb-eyebrow">{dom.domain}</h2>}
            {dom.programs.map((pg) => (
              <div key={pg.program} className="kb-program">
                <div className="kb-program-head">
                  <h3>{pg.program}</h3>
                  <span>{[pg.source, `${pg.courses.length} ${pg.courses.length === 1 ? 'course' : 'courses'}`].filter(Boolean).join(' · ')}</span>
                </div>
            {pg.courses.map(({ course: c, decks }) => {
              const isOpen = open.has(c.id);
              return (
                <section key={c.id} className={`kb-course${isOpen ? ' is-open' : ''}`}>
                  <button type="button" className="kb-course-head" aria-expanded={isOpen} onClick={() => toggle(c.id)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={isOpen ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
                    </svg>
                    <span className="kb-course-name">{c.course}</span>
                    <span className="kb-course-sub">
                      {deckCountLabel(decks)}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="kb-table-wrap">
                      <table className="kb-table">
                        <thead>
                          <tr>
                            <th scope="col">Deck</th>
                            <th scope="col">Slides</th>
                            <th scope="col">Dan’s work</th>
                            <th scope="col" className="kb-right">
                              Deck
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {decks.map((d, i) => {
                            const slides = slidesOf(outline, d.id);
                            const secs = d.sections.length ? d.sections.map((x) => x.name) : [...new Set(slides.map((x) => x.section))];
                            const mine = slides.filter((x) => x.isDansWork).length;
                            const shown = deckOpen === d.id;
                            return [
                              <tr key={d.id} className={[shown ? 'is-open' : '', i % 2 ? 'is-alt' : ''].filter(Boolean).join(' ') || undefined}>
                                <td>
                                  <button type="button" className="kb-deck-btn" aria-expanded={shown} onClick={() => setDeckOpen(shown ? null : d.id)}>
                                    <b>{d.kind === 'sheet' ? '▤' : i + 1 - decks.slice(0, i).filter((x) => x.kind === 'sheet').length}</b> · {d.title}
                                  </button>
                                  <span className="kb-secs">{d.kind === 'sheet' ? slides.map((x) => x.title).join(', ') : secs.join(' · ')}</span>
                                </td>
                                <td>
                                  {slides.length}
                                  {d.kind === 'sheet' ? (slides.length === 1 ? ' page' : ' pages') : ''}
                                </td>
                                <td>{mine || ''}</td>
                                <td className="kb-right">
                                  <OpenLink className="kb-link" deck={d} num={1}>
                                    Open
                                  </OpenLink>
                                </td>
                              </tr>,
                              shown ? (
                                <tr key={`${d.id}-slides`} className="kb-slides-row">
                                  <td colSpan={4}>
                                    <ol className="kb-slide-list">
                                      {slides.map((x) => (
                                        <li key={x.id}>
                                          <button type="button" className="kb-side-item" onClick={() => onTopic(x.id)}>
                                            <span className="kb-mono">{x.num}</span> {x.title}
                                            {x.isDansWork && <span className="kb-badge">Dan’s work</span>}
                                          </button>
                                        </li>
                                      ))}
                                    </ol>
                                  </td>
                                </tr>
                              ) : null
                            ];
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
