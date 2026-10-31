import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { byNewest, checkinsOf, isBlank, MOODS, newEntry, shortDate, streak, withCheckins, type CheckIn, type JournalEntry } from '../lib/journal';
import { isoDate } from '../lib/launchers';
import { useMobile } from '../lib/useMobile';

const PLUS = 'M12 5v14M5 12h14';
const PEN = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4';

type Props = {
  entries: JournalEntry[];
  today: Date;
  /** The routine day (resets at bed time, like 26 Days). Falls back to the calendar date. */
  day?: string;
  /** Quiet save, used while typing. */
  onSave: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
  /** Upload a journal file (.json) from the Launch Sheet. */
  onImport: (f: File) => void;
  /** Full page: every day open with its check-ins, and × to go back. */
  full?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
};

/** Launch Page: today's headline written in place, past days underneath. */
/** A text box that grows to fit what's written in it (journal check-ins), so nothing hides behind a scroll bar. */
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(fit, [props.value]);
  // Width changes (window resize, panel open) re-wrap the text.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} {...props} />;
}

export function JournalPanel({ entries, today, day, onSave, onDelete, onImport, full, onOpen, onClose }: Props) {
  const todayIso = day ?? isoDate(today);
  // Bumped when today's entry is moved to another date, so a fresh page opens for today.
  const [moved, setMoved] = useState(0);
  const sorted = byNewest(entries);
  const saved = sorted.find((e) => e.date === todayIso) ?? null;
  const lastTheme = sorted.find((e) => e.date < todayIso && e.theme.trim())?.theme ?? '';
  // A day with only a theme (the 26 Days daily goal) isn't listed as an entry.
  const past = sorted.filter((e) => e.date !== todayIso && !isBlank(e));
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const shown = all || full ? past : past.slice(0, 5);
  const run = streak(entries, todayIso);
  // Phones (Oct 30): only today shows on the card; the date opens past entries.
  const mobile = useMobile();
  const datePast = mobile && !full && onOpen ? onOpen : undefined;

  return (
    <section className={`panel panel-journal${full ? ' is-full' : ''}`} aria-labelledby="h-journal">
      <div className="panel-head">
        <h2 id="h-journal" className="panel-title">
          {onOpen ? (
            <button type="button" className="title-btn" onClick={onOpen} title="Open the whole journal">
              Journal
            </button>
          ) : (
            'Journal'
          )}
        </h2>
        <div className="panel-actions">
          <label className="icon-btn tool-btn import-btn" title="Upload journal entries (.json)">
            <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            <span className="sr-only">Upload journal entries</span>
            <input
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add an entry for another day"
            title="Add an entry for another day"
            onClick={() => {
              setIsNew(true);
              setEditing(newEntry(isoDate(new Date(new Date(`${todayIso}T12:00:00`).getTime() - 86400000)), lastTheme));
            }}
          >
            <Icon d={PLUS} />
          </button>
          {onClose && (
            <button type="button" className="icon-btn tool-btn" aria-label="Back to the Launch Page" title="Back to the Launch Page" onClick={onClose}>
              <Icon d="M6 6l12 12M18 6L6 18" />
            </button>
          )}
        </div>
      </div>

      <TodayEntry
        key={`${todayIso}:${moved}`}
        date={todayIso}
        saved={saved}
        lastTheme={lastTheme}
        onSave={onSave}
        onEditDate={(e) => {
          setIsNew(false);
          setEditing(e);
        }}
        onPastDays={datePast}
      />

      {past.length > 0 && !datePast && (
        <>
          <div className="journal-sub-row">
            <h3 className="journal-sub">Past days</h3>
            {run > 0 && (
              <span className="journal-streak" title={`${run} day${run === 1 ? '' : 's'} in a row`}>
                {run} day{run === 1 ? '' : 's'} in a row
              </span>
            )}
          </div>
          <ul className="journal-list">
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="journal-item"
                  onClick={() => {
                    setIsNew(false);
                    setEditing(e);
                  }}
                  title="Open this entry"
                >
                  <span className="journal-item-date">
                    <span className="journal-mood-mark" aria-label={e.mood ? `Mood ${e.mood}` : undefined}>{e.mood || ''}</span>
                    {shortDate(e.date)}
                  </span>
                  <span className="journal-item-text">
                    <span className="journal-item-head">{e.headline || 'Untitled'}</span>
                    {e.theme && <span className="journal-item-theme">{e.theme}</span>}
                    {full &&
                      checkinsOf(e).map((c, i) => (
                        <span key={i} className="journal-item-check">
                          <span className="checkin-label">✓ Check in #{i + 1}</span>
                          {c.text}
                        </span>
                      ))}
                  </span>
                  {checkinsOf(e).length > 0 && <span className="journal-item-more" aria-label="Has a check in" title="Has a check in">¶</span>}
                </button>
              </li>
            ))}
          </ul>
          {!full && past.length > 5 && (
            <button type="button" className="link-btn journal-all" onClick={() => setAll((x) => !x)}>
              {all ? 'Show fewer' : `Show all ${past.length}`}
            </button>
          )}
        </>
      )}

      <Sheet open={!!editing} title={isNew ? 'Add journal entry' : 'Edit journal entry'} onClose={() => setEditing(null)}>
        {editing && (
          <EntryForm
            entry={editing}
            isNew={isNew}
            taken={(d) => entries.some((x) => x.date === d && x.id !== editing.id)}
            onSave={(e) => {
              onSave(e);
              if (editing.date === todayIso && e.date !== todayIso) setMoved((n) => n + 1);
              setEditing(null);
            }}
            onDelete={() => {
              onDelete(editing.id);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

/** One emoji for the day's mood: tap to choose, tap the same one again to clear. */
function MoodPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="mood"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button type="button" className={`mood-btn${value ? '' : ' is-empty'}`} aria-label={value ? `Mood ${value}: change` : 'Pick a mood'} title="Mood" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {value || '☺'}
      </button>
      {open && (
        <span className="mood-list" role="listbox" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={m === value}
              className="mood-opt"
              onClick={() => {
                onChange(m === value ? '' : m);
                setOpen(false);
              }}
            >
              {m}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

const checkTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';

/** Check-ins for a day: "✓ CHECK IN #1", "✓ CHECK IN #2"… each with its own short reflection. */
function CheckIns({ list, onChange, onBlur, focusLast }: { list: CheckIn[]; onChange: (l: CheckIn[]) => void; onBlur?: () => void; focusLast?: boolean }) {
  return (
    <>
      {list.map((c, i) => (
        <div key={i} className="checkin">
          <span className="checkin-label">
            ✓ Check in #{i + 1}
            {c.at && <span className="checkin-time">{checkTime(c.at)}</span>}
          </span>
          <AutoTextarea
            className="journal-body"
            value={c.text}
            autoFocus={focusLast && i === list.length - 1 && !c.text}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            onBlur={onBlur}
            rows={3}
            placeholder="A short reflection"
            aria-label={`Check in ${i + 1}`}
          />
        </div>
      ))}
    </>
  );
}

/** Today's entry, typed straight into the panel. Saves itself a moment after you stop typing. */
function TodayEntry({ date, saved, lastTheme, onSave, onEditDate, onPastDays }: { date: string; saved: JournalEntry | null; lastTheme: string; onSave: (e: JournalEntry) => void; onEditDate: (e: JournalEntry) => void; onPastDays?: () => void }) {
  // The theme carries on from the last entry until you change it.
  const [d, setD] = useState<JournalEntry>(() => saved ?? newEntry(date, lastTheme));
  const [cks, setCks] = useState<CheckIn[]>(() => (saved ? checkinsOf(saved) : []));
  const [state, setState] = useState<'idle' | 'typing' | 'saved'>('idle');
  const latest = useRef(withCheckins(d, cks));
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(onSave);
  save.current = onSave;

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const e = latest.current;
    if (isBlank(e) && !saved) return;
    save.current(e);
    setState('saved');
  };
  const queue = (next: JournalEntry, list: CheckIn[]) => {
    latest.current = withCheckins(next, list);
    setState('typing');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
  };
  // Today's entry arrived after the panel opened (loaded from the cloud, or saved on another device).
  useEffect(() => {
    if (!saved || saved.id === latest.current.id) return;
    const mine = latest.current;
    const next = isBlank(mine) ? saved : { ...mine, id: saved.id };
    const list = isBlank(mine) ? checkinsOf(saved) : cks;
    latest.current = withCheckins(next, list);
    setD(next);
    setCks(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  // A theme from an imported or older entry that loaded after the panel opened.
  useEffect(() => {
    if (saved || d.theme || !lastTheme) return;
    const next = { ...d, theme: lastTheme };
    setD(next);
    latest.current = withCheckins(next, cks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTheme, saved]);

  // Save what's typed if the page closes or the panel goes away mid-sentence.
  useEffect(() => () => {
    if (timer.current !== undefined) flush();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: 'headline' | 'theme' | 'mood', v: string) => {
    const next = { ...d, [k]: v };
    setD(next);
    queue(next, cks);
  };
  const setList = (list: CheckIn[]) => {
    setCks(list);
    queue(d, list);
  };

  return (
    <div className="journal-today">
      <div className="journal-top-row">
        <input
          className="journal-headline"
          value={d.headline}
          onChange={(e) => set('headline', e.target.value)}
          onBlur={flush}
          placeholder="One headline for the day"
          aria-label="Today's headline"
        />
        <span className="journal-when">
          <MoodPicker
            value={d.mood ?? ''}
            onChange={(m) => {
              const next = { ...d, mood: m };
              setD(next);
              latest.current = withCheckins(next, cks);
              flush();
            }}
          />
          <button
            type="button"
            className="journal-date journal-date-btn"
            title={onPastDays ? 'Past entries' : 'Change the date (moves this entry to that day)'}
            onClick={() => {
              flush();
              if (onPastDays) onPastDays();
              else onEditDate(latest.current);
            }}
          >
            {shortDate(date)}
          </button>
        </span>
      </div>
      <input
        className="journal-theme"
        value={d.theme}
        onChange={(e) => set('theme', e.target.value)}
        onBlur={flush}
        placeholder="Theme"
        aria-label="Theme"
      />
      <CheckIns list={cks} onChange={setList} onBlur={flush} focusLast />
      <div className="journal-foot">
        <button
          type="button"
          className="journal-toggle"
          onClick={() => setCks((l) => [...l.filter((c) => c.text.trim()), { at: new Date().toISOString(), text: '' }])}
          disabled={cks.some((c) => !c.text.trim())}
        >
          <Icon d={PEN} size={14} />
          Add check in
        </button>
        <span className="journal-state" aria-live="polite">
          {state === 'typing' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
      </div>
    </div>
  );
}

function EntryForm({ entry, isNew, taken, onSave, onDelete }: { entry: JournalEntry; isNew: boolean; taken: (date: string) => boolean; onSave: (e: JournalEntry) => void; onDelete: () => void }) {
  const [d, setD] = useState(entry);
  const [cks, setCks] = useState<CheckIn[]>(() => checkinsOf(entry));
  const formId = useId();
  const clash = taken(d.date);
  const hasText = !!d.headline.trim() || cks.some((c) => c.text.trim());
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (clash || !d.date) return;
        onSave(withCheckins({ ...d, headline: d.headline.trim(), theme: d.theme.trim() }, cks));
      }}
    >
      <label className="field">
        <span>Date</span>
        <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} required />
      </label>
      {clash && <p className="field-note">There's already an entry for that day. Open it from the list instead.</p>}
      <label className="field">
        <span>Headline</span>
        <input value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} placeholder="One headline for the day" />
      </label>
      <label className="field">
        <span>Theme</span>
        <input value={d.theme} onChange={(e) => setD({ ...d, theme: e.target.value })} placeholder="Theme for the day" />
      </label>
      <div className="field">
        <span>Mood</span>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button key={m} type="button" className="mood-opt" aria-pressed={d.mood === m} onClick={() => setD({ ...d, mood: d.mood === m ? '' : m })}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <CheckIns list={cks} onChange={setCks} focusLast />
        <button
          type="button"
          className="journal-toggle"
          disabled={cks.some((c) => !c.text.trim())}
          onClick={() => setCks((l) => [...l, { at: null, text: '' }])}
        >
          <Icon d={PEN} size={14} />
          Add check in
        </button>
      </div>
      <FormActions formId={formId} saveDisabled={clash || !d.date || !hasText} onDelete={isNew ? undefined : onDelete} deleteLabel="this entry" />
    </form>
  );
}
