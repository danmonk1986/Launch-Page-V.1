import { useState, type FormEvent } from 'react';
import { Sheet, FormActions } from './Sheet';
import { FEELINGS, HANGUPS, sendFeedback } from '../lib/feedback';

/**
 * V20-446 (Dan, Nov 20): the feedback form, Dan's three parts: HANGUP ⌄ · Your words · Feeling.
 * Used by the Feedback flag (any time) and by "How was setup?" (once, after the first setup).
 */
function FeedbackForm({ id, kind, page, setupSeconds, intro, onSent }: { id: string; kind: 'flag' | 'setup'; page: string; setupSeconds?: number | null; intro: string; onSent: () => void }) {
  const [hangup, setHangup] = useState('');
  const [words, setWords] = useState('');
  const [feeling, setFeeling] = useState<number | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [err, setErr] = useState('');
  const ready = !!hangup || !!words.trim() || feeling != null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || state === 'sending') return;
    setState('sending');
    const problem = await sendFeedback({ kind, hangup: hangup || null, words, feeling, page, setupSeconds });
    if (problem) {
      setState('error');
      setErr(`That didn't send: ${problem}`);
      return;
    }
    onSent();
  };
  return (
    <form id={id} className="feedback-form" onSubmit={submit}>
      <FormActions formId={id} saveDisabled={!ready || state === 'sending'} />
      <p className="field-hint">{intro}</p>
      <label className="field">
        <span>Hangup</span>
        <select value={hangup} onChange={(e) => setHangup(e.target.value)}>
          <option value="">Pick one</option>
          {HANGUPS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Your words</span>
        <textarea rows={4} maxLength={2000} value={words} placeholder="What happened, or what you'd change" onChange={(e) => setWords(e.target.value)} />
      </label>
      <div className="field">
        <span>Feeling</span>
        <div className="feedback-feelings" role="radiogroup" aria-label="Feeling">
          {FEELINGS.map((f) => (
            <button key={f.v} type="button" role="radio" aria-checked={feeling === f.v} className={`feedback-feeling${feeling === f.v ? ' is-on' : ''}`} title={f.label} aria-label={f.label} onClick={() => setFeeling(feeling === f.v ? null : f.v)}>
              <span aria-hidden="true">{f.face}</span>
            </button>
          ))}
        </div>
      </div>
      {state === 'error' && <p className="pw-bad" role="alert">{err}</p>}
      <div className="feedback-send">
        <button type="submit" className="btn" disabled={!ready || state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

/** The Feedback flag on the right edge (a corner button on phones), for beta testers. */
export function FeedbackFlag({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  const [thanks, setThanks] = useState(false);
  return (
    <>
      <button type="button" className="feedback-flag" onClick={() => { setThanks(false); setOpen(true); }} aria-label="Send feedback" title="Send feedback">
        <svg className="feedback-flag-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 22V4M4 4h12l-2 4 2 4H4" />
        </svg>
        <span className="feedback-flag-word">Feedback</span>
      </button>
      <Sheet open={open} title={thanks ? 'Thank you' : 'Feedback'} onClose={() => setOpen(false)}>
        {thanks ? (
          <div className="feedback-thanks">
            <p>Got it. Dan @ STARDVST reads every one.</p>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        ) : (
          <FeedbackForm id="feedback-flag-form" kind="flag" page={page} intro="Tell Dan what tripped you up, what you'd change, or what you love. Pick any of the three." onSent={() => setThanks(true)} />
        )}
      </Sheet>
    </>
  );
}

/** "How was setup?" once, right after a tester's first setup. Skip is always there. */
export function SetupFeedback({ setupSeconds, onDone }: { setupSeconds: number | null; onDone: () => void }) {
  const [thanks, setThanks] = useState(false);
  const mins = setupSeconds ? Math.max(1, Math.round(setupSeconds / 60)) : null;
  return (
    <Sheet open title={thanks ? 'Thank you' : 'How was setup?'} onClose={onDone}>
      {thanks ? (
        <div className="feedback-thanks">
          <p>Thanks. That helps make setup better for the next person.</p>
          <button type="button" className="btn" onClick={onDone}>
            To my Launch Page
          </button>
        </div>
      ) : (
        <>
          <FeedbackForm
            id="feedback-setup-form"
            kind="setup"
            page="setup"
            setupSeconds={setupSeconds}
            intro={`You're set up${mins ? ` (about ${mins} min)` : ''}. Before you go: what was your hangup, if any?`}
            onSent={() => setThanks(true)}
          />
          <div className="feedback-skip">
            <button type="button" className="link-btn" onClick={onDone}>
              Skip
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
