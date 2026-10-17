import { useEffect, useId, useRef, useState } from 'react';
import { FormActions, Sheet } from './Sheet';
import { Icon } from './Tasks';
import { byNewest, isBlank, journalDate, newEntry, type JournalEntry } from '../lib/journal';
import { isoDate } from '../lib/launchers';

const PLUS = 'M12 5v14M5 12h14';
const PEN = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4';
const CHEVRON = 'M6 9l6 6 6-6';

type Props = {
  entries: JournalEntry[];
  today: Date;
  /** Quiet save, used while typing. */
  onSave: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
};

/** Launch Page: today's headline written in place, past days underneath. */
export function JournalPanel({ entries, today, onSave, onDelete }: Props) {
  const todayIso = isoDate(today);
  const sorted = byNewest(entries);
  const saved = sorted.find((e) => e.date === todayIso) ?? null;
  const lastTheme = sorted.find((e) => e.date < todayIso && e.theme.trim())?.theme ?? '';
  const past = sorted.filter((e) => e.date !== todayIso);
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const shown = all ? past : past.slice(0, 5);

  return (
    <section className="panel panel-journal" aria-labelledby="h-journal">
      <div className="panel-head">
        <h2 id="h-journal" className="panel-title">
          Journal
        </h2>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn tool-btn"
            aria-label="Add an entry for another day"
            title="Add an entry for another day"
            onClick={() => {
              setIsNew(true);
              setEditing(newEntry(isoDate(new Date(today.getTime() - 86400000)), lastTheme));
            }}
          >
            <Icon d={PLUS} />
          </button>
        </div>
      </div>

      <TodayEntry key={todayIso} date={todayIso} saved={saved} lastTheme={lastTheme} onSave={onSave} />

      {past.length > 0 && (
        <>
          <h3 className="journal-sub">Past days</h3>
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
                  <span className="journal-item-date">{journalDate(e.date)}</span>
                  <span className="journal-item-text">
                    <span className="journal-item-head">{e.headline || 'Untitled'}</span>
                    {e.theme && <span className="journal-item-theme">{e.theme}</span>}
                  </span>
                  {e.body.trim() && <span className="journal-item-more" aria-label="Has a page" title="Has a page">¶</span>}
                </button>
              </li>
            ))}
          </ul>
          {past.length > 5 && (
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

/** Today's entry, typed straight into the panel. Saves itself a moment after you stop typing. */
function TodayEntry({ date, saved, lastTheme, onSave }: { date: string; saved: JournalEntry | null; lastTheme: string; onSave: (e: JournalEntry) => void }) {
  const [d, setD] = useState<JournalEntry>(() => saved ?? newEntry(date));
  const [open, setOpen] = useState(() => !!saved?.body.trim());
  const [state, setState] = useState<'idle' | 'typing' | 'saved'>('idle');
  const latest = useRef(d);
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
  // Today's entry arrived after the panel opened (loaded from the cloud, or saved on another device).
  useEffect(() => {
    if (!saved || saved.id === latest.current.id) return;
    const next = isBlank(latest.current) ? saved : { ...latest.current, id: saved.id };
    latest.current = next;
    setD(next);
    if (next.body.trim()) setOpen(true);
  }, [saved]);

  // Save what's typed if the page closes or the panel goes away mid-sentence.
  useEffect(() => () => {
    if (timer.current !== undefined) flush();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: 'headline' | 'theme' | 'body', v: string) => {
    const next = { ...latest.current, [k]: v };
    latest.current = next;
    setD(next);
    setState('typing');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
  };

  return (
    <div className="journal-today">
      <div className="journal-today-top">
        <span className="journal-today-date">
          <span className="now-pill">TODAY</span> {journalDate(date)}
        </span>
        <span className="journal-state" aria-live="polite">
          {state === 'typing' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <input
        className="journal-headline"
        value={d.headline}
        onChange={(e) => set('headline', e.target.value)}
        onBlur={flush}
        placeholder="One headline for the day"
        aria-label="Today's headline"
      />
      <input
        className="journal-theme"
        value={d.theme}
        onChange={(e) => set('theme', e.target.value)}
        onBlur={flush}
        placeholder={lastTheme ? `Theme · last: ${lastTheme}` : 'Theme for the day'}
        aria-label="Today's theme"
      />
      <button type="button" className={`journal-toggle ${open ? 'is-open' : ''}`} aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <Icon d={open ? CHEVRON : PEN} size={14} />
        {open ? 'Hide the page' : d.body.trim() ? 'Open the page' : 'Write more'}
      </button>
      {open && (
        <textarea
          className="journal-body"
          value={d.body}
          onChange={(e) => set('body', e.target.value)}
          onBlur={flush}
          rows={6}
          placeholder="What happened, what you learned, what's next…"
          aria-label="Today's page"
        />
      )}
    </div>
  );
}

function EntryForm({ entry, isNew, taken, onSave, onDelete }: { entry: JournalEntry; isNew: boolean; taken: (date: string) => boolean; onSave: (e: JournalEntry) => void; onDelete: () => void }) {
  const [d, setD] = useState(entry);
  const formId = useId();
  const clash = taken(d.date);
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        if (clash || !d.date) return;
        onSave({ ...d, headline: d.headline.trim(), theme: d.theme.trim() });
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
      <label className="field">
        <span>Page</span>
        <textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={10} />
      </label>
      <FormActions formId={formId} saveDisabled={clash || !d.date || (!d.headline.trim() && !d.body.trim())} onDelete={isNew ? undefined : onDelete} deleteLabel="this entry" />
    </form>
  );
}
