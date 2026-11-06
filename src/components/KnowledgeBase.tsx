import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Tasks';
import {
  SECTION_ORDER,
  cachedOutline,
  importIndex,
  loadOutline,
  readIndex,
  searchKb,
  slidesOf,
  snippetParts,
  tree,
  type KbDeck,
  type KbHit,
  type KbOutline
} from '../lib/kb';

/**
 * KNOWLEDGE!B4SE (KB-025…028, Nov 6): search, browse and open any lesson, slide or cheat sheet.
 * v1 opens the deck itself at the slide (the artifact is always the current version).
 */
type View = 'search' | 'browse' | 'sheets';
type Props = { userId: string | null; onClose: () => void; onStatus: (msg: string) => void };

const CLOSE = 'M6 6l12 12M18 6L6 18';
const UPLOAD = 'M12 3v12M7 10l5 5 5-5M5 21h14';
const OPEN = 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5';
const SUGGEST = ['MVC', 'usability testing', 'RICE', 'SQL injection', 'Lean Canvas', 'go-to-market'];

export function KnowledgeBasePage({ userId, onClose, onStatus }: Props) {
  const [outline, setOutline] = useState<KbOutline>(cachedOutline);
  const [offline, setOffline] = useState(false);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('search');
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [importing, setImporting] = useState('');

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

  async function onImport(f: File) {
    if (!userId) return onStatus('Sign in to import: the knowledge base is saved to your account.');
    try {
      const index = readIndex(JSON.parse(await f.text()));
      const r = await importIndex(userId, index, setImporting);
      setImporting('');
      await refresh();
      onStatus(`KNOWLEDGE!B4SE: ${r.slides} slides from ${r.decks} decks in ${r.courses} courses imported.`);
    } catch (err) {
      setImporting('');
      onStatus(`KNOWLEDGE!B4SE import stopped: ${(err as Error).message}`);
    }
  }

  const decks = outline.decks.filter((d) => d.kind === 'deck');
  const sheets = outline.decks.filter((d) => d.kind === 'sheet');
  const VIEWS: { id: View; label: string; hint: string }[] = [
    { id: 'search', label: 'Search', hint: 'Search every slide, note and tag' },
    { id: 'browse', label: 'Browse', hint: 'Domain → course → deck → slides' },
    { id: 'sheets', label: 'Cheat sheets', hint: 'One-page cheat sheets' }
  ];

  return (
    <section className="panel panel-kb" aria-labelledby="h-kb">
      <div className="panel-head">
        <div>
          <h2 id="h-kb" className="panel-title kb-title">
            KNOWLEDGE!B4SE
          </h2>
          <p className="panel-sub">
            {outline.slides.length
              ? `${outline.slides.length} slides · ${decks.length} decks · ${sheets.length} cheat sheet ${sheets.length === 1 ? 'set' : 'sets'} · ${outline.courses.length} courses`
              : loading
                ? 'Loading…'
                : 'Nothing imported yet'}
            {offline && outline.slides.length > 0 ? ' · saved copy (titles and tags only)' : ''}
          </p>
        </div>
        <div className="panel-actions">
          <label className="icon-btn tool-btn import-btn" title="Import a knowledge base index (kb-index.json)">
            <Icon d={UPLOAD} />
            <span className="sr-only">Import a knowledge base index</span>
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
          <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={onClose}>
            <Icon d={CLOSE} />
          </button>
        </div>
      </div>

      <div className="area-filter kb-views" role="group" aria-label="KNOWLEDGE!B4SE">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className="area-pill" aria-pressed={view === v.id} title={v.hint} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {importing && (
        <p className="kb-note" role="status">
          {importing}
        </p>
      )}
      {problem && <p className="kb-note kb-problem">{problem}</p>}

      {!loading && !outline.slides.length ? (
        <div className="panel-empty kb-empty">
          <p>Your course decks show up here once they’re imported.</p>
          <p>
            Tap <b>Import</b> (↓ above) and pick the <b>kb-index.json</b> file from your KNOWLEDGE!B4SE chat. Importing again later updates what changed.
          </p>
        </div>
      ) : view === 'search' ? (
        <SearchView
          outline={outline}
          onBrowse={(courseId) => {
            setOpenCourse(courseId);
            setView('browse');
          }}
        />
      ) : view === 'browse' ? (
        <BrowseView outline={outline} openCourse={openCourse} />
      ) : (
        <SheetsView outline={outline} sheets={sheets} />
      )}
    </section>
  );
}

// ---------- Search ----------

function SearchView({ outline, onBrowse }: { outline: KbOutline; onBrowse: (courseId: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<KbHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(false);
  const [domain, setDomain] = useState('');
  const [course, setCourse] = useState('');
  const [section, setSection] = useState('');
  const [dans, setDans] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const deckById = useMemo(() => new Map(outline.decks.map((d) => [d.id, d])), [outline]);
  const courseById = useMemo(() => new Map(outline.courses.map((c) => [c.id, c])), [outline]);
  const domains = useMemo(() => [...new Set(outline.courses.map((c) => c.domain))], [outline]);
  const courses = outline.courses.filter((c) => !domain || c.domain === domain);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const term = q.trim();
    const n = ++seq.current;
    if (!term) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchKb(term, outline);
      if (n !== seq.current) return; // a newer search is on its way
      setHits(r.hits);
      setOffline(r.offline);
      setSearching(false);
    }, 180);
    return () => clearTimeout(t);
  }, [q, outline]);

  const shown = hits.filter((h) => {
    const d = deckById.get(h.deckId);
    const c = d && courseById.get(d.courseId);
    if (!d || !c) return false;
    if (domain && c.domain !== domain) return false;
    if (course && c.id !== course) return false;
    if (section && h.section !== section) return false;
    if (dans && !h.isDansWork) return false;
    return true;
  });
  const sectionsFound = SECTION_ORDER.filter((s) => hits.some((h) => h.section === s));

  // Course → deck → hits, courses in library order, decks by their best hit.
  const groups = useMemo(() => {
    const byDeck = new Map<string, KbHit[]>();
    for (const h of shown) byDeck.set(h.deckId, [...(byDeck.get(h.deckId) ?? []), h]);
    const byCourse = new Map<string, { deck: KbDeck; hits: KbHit[] }[]>();
    for (const [deckId, list] of byDeck) {
      const deck = deckById.get(deckId)!;
      byCourse.set(deck.courseId, [...(byCourse.get(deck.courseId) ?? []), { deck, hits: list }]);
    }
    return [...byCourse.entries()]
      .map(([courseId, ds]) => ({ course: courseById.get(courseId)!, decks: ds.sort((a, b) => b.hits[0].rank - a.hits[0].rank || a.deck.sort - b.deck.sort) }))
      .sort((a, b) => a.course.domainSort - b.course.domainSort || a.course.courseSort - b.course.courseSort);
  }, [shown, deckById, courseById]);

  return (
    <div className="kb-search">
      <label className="kb-box">
        <span className="sr-only">Search the knowledge base</span>
        <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Search every lesson, slide and cheat sheet"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="kb-filters">
        {domains.length > 1 && (
          <label className="kb-select">
            <span className="sr-only">Domain</span>
            <select
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setCourse('');
              }}
            >
              <option value="">All domains</option>
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <label className="kb-select">
          <span className="sr-only">Course</span>
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.course}
              </option>
            ))}
          </select>
        </label>
        <div className="area-filter" role="group" aria-label="Section">
          <button type="button" className="area-pill" aria-pressed={!section} onClick={() => setSection('')}>
            All
          </button>
          {(sectionsFound.length ? sectionsFound : ['Key topics', 'Practice', 'AI Expansion']).map((s) => (
            <button key={s} type="button" className="area-pill" aria-pressed={section === s} onClick={() => setSection(section === s ? '' : s)}>
              {s}
            </button>
          ))}
          <button type="button" className="area-pill kb-dans" aria-pressed={dans} title="Only Dan’s own work: My work slides, reflections, his code" onClick={() => setDans((d) => !d)}>
            Dan’s work
          </button>
        </div>
      </div>

      {!q.trim() ? (
        <div className="kb-start">
          <p className="kb-hint">Try:</p>
          <div className="area-filter">
            {SUGGEST.map((s) => (
              <button key={s} type="button" className="area-pill" onClick={() => setQ(s)}>
                {s}
              </button>
            ))}
          </div>
          <CourseCards outline={outline} onBrowse={onBrowse} />
        </div>
      ) : (
        <>
          <p className="kb-count" role="status">
            {searching
              ? 'Searching…'
              : shown.length
                ? `${shown.length} ${shown.length === 1 ? 'slide' : 'slides'}${shown.length < hits.length ? ` (of ${hits.length})` : ''}${offline ? ' · titles and tags only while offline' : ''}`
                : hits.length
                  ? 'Nothing with these filters. Clear a filter to see the rest.'
                  : 'No slides match. Try fewer or shorter words.'}
          </p>
          {groups.map(({ course: c, decks }) => (
            <div key={c.id} className="kb-group">
              <h3 className="kb-course">
                {c.course}
                <span className="kb-domain">{c.domain}</span>
              </h3>
              {decks.map(({ deck, hits: list }) => (
                <div key={deck.id} className="kb-deck">
                  <div className="kb-deck-head">
                    <p className="kb-deck-title">{deck.title}</p>
                    <a className="kb-open-deck" href={deck.url} target="_blank" rel="noopener noreferrer">
                      Open {deck.kind === 'sheet' ? 'sheets' : 'deck'}
                    </a>
                  </div>
                  <ul className="kb-hits">
                    {list.map((h) => (
                      <HitRow key={h.id} hit={h} sheet={deck.kind === 'sheet'} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** "Key topic · Outcome 3", or the section when the eyebrow is a cover breadcrumb or "Part 2 of 4". */
function metaOf(s: { slideId: string; section: string; eyebrow: string }) {
  if (s.slideId === 'cover') return `${s.section || 'Overview'} · Cover`;
  if (!s.eyebrow || /^part \d/i.test(s.eyebrow)) return s.section;
  return s.eyebrow;
}

function HitRow({ hit, sheet }: { hit: KbHit; sheet: boolean }) {
  const parts = snippetParts(hit.snippet);
  return (
    <li className="kb-hit">
      <span className="kb-num" aria-hidden="true">
        {sheet ? 'p' : ''}
        {hit.num}
      </span>
      <div className="kb-hit-main">
        <p className="kb-hit-title">{hit.title}</p>
        <p className="kb-hit-meta">
          {metaOf(hit)}
          {hit.isDansWork && <span className="chip kb-chip-dan">Dan’s work</span>}
        </p>
        {parts.length > 0 && (
          <p className="kb-snippet">
            {parts.map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
          </p>
        )}
        {hit.tags.length > 0 && (
          <p className="kb-tags">
            {hit.tags
              .filter((t) => !/dan['’]s work/i.test(t))
              .slice(0, 6)
              .map((t) => (
                <span key={t} className="kb-tag">
                  {t}
                </span>
              ))}
          </p>
        )}
      </div>
      <a className="btn btn-quiet kb-open" href={hit.link} target="_blank" rel="noopener noreferrer" title={sheet ? 'Open the cheat sheets' : `Open the deck at slide ${hit.num}`}>
        <Icon d={OPEN} />
        <span>{sheet ? 'Open' : 'Open at slide'}</span>
      </a>
    </li>
  );
}

function CourseCards({ outline, onBrowse }: { outline: KbOutline; onBrowse: (courseId: string) => void }) {
  const domains = tree(outline);
  return (
    <div className="kb-cards">
      {domains.map((dom) =>
        dom.courses.map(({ course: c, decks }) => (
          <button key={c.id} type="button" className="kb-card" onClick={() => onBrowse(c.id)} title={`Browse ${c.course}`}>
            <span className="kb-card-domain">{dom.domain}</span>
            <span className="kb-card-title">{c.course}</span>
            <span className="kb-card-sub">
              {[
                (n => (n ? `${n} ${n === 1 ? 'deck' : 'decks'}` : ''))(decks.filter((d) => d.kind === 'deck').length),
                decks.some((d) => d.kind === 'sheet') ? 'cheat sheets' : ''
              ]
                .filter(Boolean)
                .join(' · ')}
              {c.source ? ` · ${c.source}` : ''}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// ---------- Browse ----------

function BrowseView({ outline, openCourse }: { outline: KbOutline; openCourse: string | null }) {
  const domains = tree(outline);
  return (
    <div className="kb-browse">
      {domains.map((dom) => (
        <div key={dom.domain} className="kb-domain-block">
          <h3 className="kb-domain-title">{dom.domain}</h3>
          {dom.courses.map(({ course: c, decks }) => (
            <details key={c.id} className="kb-tree-course" open={c.id === openCourse || undefined}>
              <summary>
                <span>{c.course}</span>
                <span className="kb-tree-count">
                  {decks.length} {decks.length === 1 ? 'item' : 'items'}
                  {c.source ? ` · ${c.source}` : ''}
                </span>
              </summary>
              <ol className="kb-tree-decks">
                {decks.map((d, i) => (
                  <li key={d.id}>
                    <details className="kb-tree-deck">
                      <summary>
                        <span className="kb-tree-n">{d.kind === 'sheet' ? '▤' : i + 1}</span>
                        <span>{d.title}</span>
                        <span className="kb-tree-count">
                          {d.slideCount} {d.kind === 'sheet' ? 'pages' : 'slides'}
                        </span>
                      </summary>
                      <DeckOutline outline={outline} deck={d} />
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}

function DeckOutline({ outline, deck }: { outline: KbOutline; deck: KbDeck }) {
  const slides = slidesOf(outline, deck.id);
  const bySection: { name: string; description: string; slides: typeof slides }[] = [];
  for (const s of slides) {
    const last = bySection[bySection.length - 1];
    if (last && last.name === s.section) last.slides.push(s);
    else bySection.push({ name: s.section, description: deck.sections.find((x) => x.name === s.section)?.description ?? '', slides: [s] });
  }
  return (
    <div className="kb-outline">
      <a className="kb-open-deck" href={deck.url} target="_blank" rel="noopener noreferrer">
        Open {deck.kind === 'sheet' ? 'the cheat sheets' : 'the deck'}
      </a>
      {bySection.map((sec, i) => (
        <div key={`${sec.name}-${i}`} className="kb-outline-sec">
          <p className="kb-outline-name" title={sec.description}>
            {sec.name || 'Slides'}
          </p>
          <ul>
            {sec.slides.map((s) => (
              <li key={s.id}>
                <a href={s.link} target="_blank" rel="noopener noreferrer">
                  <span className="kb-num">{s.num}</span>
                  <span>{s.title}</span>
                  {s.isDansWork && <span className="chip kb-chip-dan">Dan’s work</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- Cheat sheets ----------

function SheetsView({ outline, sheets }: { outline: KbOutline; sheets: KbDeck[] }) {
  const courseById = new Map(outline.courses.map((c) => [c.id, c]));
  const order = (d: KbDeck) => {
    const c = courseById.get(d.courseId);
    return c ? c.domainSort * 1000 + c.courseSort : 0;
  };
  sheets = [...sheets].sort((a, b) => order(a) - order(b) || a.sort - b.sort);
  if (!sheets.length) return <p className="panel-empty">No cheat sheets imported yet.</p>;
  return (
    <div className="kb-sheets">
      {sheets.map((d) => (
        <div key={d.id} className="kb-sheet">
          <div className="kb-deck-head">
            <div>
              <p className="kb-deck-title">{d.title}</p>
              <p className="kb-hit-meta">{courseById.get(d.courseId)?.course ?? ''}</p>
            </div>
            <a className="btn btn-quiet kb-open" href={d.url} target="_blank" rel="noopener noreferrer">
              <Icon d={OPEN} />
              <span>Open</span>
            </a>
          </div>
          <ul className="kb-sheet-pages">
            {slidesOf(outline, d.id).map((p) => (
              <li key={p.id}>
                <a href={p.link} target="_blank" rel="noopener noreferrer">
                  <span className="kb-sheet-page">{p.title}</span>
                  <span className="kb-sheet-heads">{p.tags.filter((t) => t !== 'cheat sheet').slice(0, 5).join(' · ')}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
