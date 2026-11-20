import { useState } from 'react';
import { supabase } from '../lib/supabase';

type State = 'closed' | 'open' | 'working' | 'sent' | 'error';

/** "Request beta test" on the sign-in page. Saves to the beta_requests table. */
export function BetaRequest({ startOpen = false, onCancel, onBack }: { startOpen?: boolean; onCancel?: () => void; onBack?: () => void } = {}) {
  // V20-294: SIGN UP on Welcome opens the request straight away.
  const [state, setState] = useState<State>(startOpen ? 'open' : 'closed');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('working');
    // Insert only (no .select()): visitors can add a request but never read the list.
    const { error } = await supabase
      .from('beta_requests')
      .insert({ name: name.trim(), email: email.trim(), note: note.trim() });
    if (!error) {
      setState('sent');
      return;
    }
    if (error.code === 'P0001' && /already has an account/i.test(error.message)) {
      // V20-440 (Dan, Nov 20): an email that already has an account can't request an invite (0075).
      setState('error');
      setMessage("That email is already invited or has an account. Check that inbox for your invite, or tap Back, then SIGN IN.");
      return;
    }
    if (error.code === '23505') {
      // V20-429 (Dan, Nov 20): one request per email. The database refuses a second one (unique on the email,
      // any capitals); say so plainly instead of pretending a new request went in.
      setState('error');
      setMessage("That email has already asked for an invite. You're on the list. I'll be in touch soon.");
      return;
    }
    setState('error');
    setMessage("That didn't send. Try again in a minute.");
  }

  if (state === 'closed') {
    return (
      <button type="button" className="link-btn beta-open" onClick={() => setState('open')}>
        Request an invite
      </button>
    );
  }

  if (state === 'sent') {
    return <p className="signin-note beta-thanks">Thanks{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. You're on the list. I'll be in touch soon.</p>;
  }

  return (
    <form onSubmit={submit} className="signin-form beta-form" aria-label="Request an invite">
      <p className="beta-title">Request an invite</p>
      <label className="field">
        <span>Name</span>
        <input type="text" required autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>What would you use it for? (optional)</span>
        <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {/* V20-403 (Dan, Nov 19): on the request page, BACK sits beside SEND REQUEST like the tour's BACK / NEXT. */}
      {onBack ? (
        <div className="tour-actions beta-actions">
          <button type="button" className="welcome-btn" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="welcome-btn welcome-key" disabled={state === 'working'}>
            {state === 'working' ? 'Sending…' : 'Send request'}
          </button>
        </div>
      ) : (
        <button className="btn" type="submit" disabled={state === 'working'}>
          {state === 'working' ? 'Sending…' : 'Send request'}
        </button>
      )}
      {state === 'error' && <p className="signin-error">{message}</p>}
      {/* V20-297: on its own sign-up page the page's ← Back does this. */}
      {!startOpen && (
        <button type="button" className="link-btn" onClick={() => (onCancel ? onCancel() : setState('closed'))}>
          Cancel
        </button>
      )}
    </form>
  );
}
