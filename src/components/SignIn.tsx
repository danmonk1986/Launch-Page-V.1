import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
    }
  }

  return (
    <main className="signin">
      <img className="signin-logo" src="/launchpage-logo.png" alt="LaunchPage" />
      {state === 'sent' ? (
        <p className="signin-note">Check {email} for a sign-in link. Open it on this device.</p>
      ) : (
        <form onSubmit={send} className="signin-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="btn" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
          {state === 'error' && <p className="signin-error">Sign-in link not sent: {message}</p>}
        </form>
      )}
    </main>
  );
}
