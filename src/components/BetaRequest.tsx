import { useState } from 'react';
import { supabase } from '../lib/supabase';

type State = 'closed' | 'open' | 'working' | 'sent' | 'error';

/** "Request beta test" on the sign-in page. Saves to the beta_requests table. */
export function BetaRequest() {
  const [state, setState] = useState<State>('closed');
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
    if (!error || error.code === '23505') {
      // 23505 = this email already asked. Treat it as a success.
      setState('sent');
      return;
    }
    setState('error');
    setMessage('Request not sent. Please try again in a moment.');
  }

  if (state === 'closed') {
    return (
      <button type="button" className="link-btn beta-open" onClick={() => setState('open')}>
        Request beta test
      </button>
    );
  }

  if (state === 'sent') {
    return <p className="signin-note beta-thanks">Thanks{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}. You're on the beta list, and I'll be in touch.</p>;
  }

  return (
    <form onSubmit={submit} className="signin-form beta-form" aria-label="Request beta test">
      <p className="beta-title">Request beta test</p>
      <label className="field">
        <span>Name</span>
        <input type="text" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>What would you use it for? (optional)</span>
        <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn" type="submit" disabled={state === 'working'}>
        {state === 'working' ? 'Sending…' : 'Send request'}
      </button>
      {state === 'error' && <p className="signin-error">{message}</p>}
      <button type="button" className="link-btn" onClick={() => setState('closed')}>
        Cancel
      </button>
    </form>
  );
}
