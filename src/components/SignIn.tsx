import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { BetaRequest } from './BetaRequest';

type Mode = 'password' | 'link';
type State = 'idle' | 'working' | 'sent' | 'error';

export function SignIn() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [linkedSent, setLinkedSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('working');
    if (mode === 'password') {
      const { error: direct } = await supabase.auth.signInWithPassword({ email, password });
      // V20-118: not the sign-in email? It may be the account's linked email: sign in through that.
      let error = direct;
      if (direct?.message === 'Invalid login credentials') {
        const { data } = await supabase.functions.invoke('email-sign-in', { body: { email, password } }).catch(() => ({ data: null }));
        if (data?.access_token) {
          const { error: set } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
          error = set;
        }
      }
      if (error) {
        setState('error');
        setMessage(
          error.message === 'Invalid login credentials'
            ? 'Email or password is wrong. No password yet? Sign in with an email link, then set one in Settings › Account Information.'
            : error.message
        );
      }
      // On success the auth listener in App swaps this screen for the dashboard.
      return;
    }
    // V20-118: a linked email gets its link sent to the account's sign-in email.
    const { data: linked } = await supabase.functions
      .invoke('email-sign-in', { body: { mode: 'link', email, redirectTo: window.location.origin } })
      .catch(() => ({ data: null }));
    if (linked?.linked) {
      setLinkedSent(true);
      setState('sent');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) {
      setState('error');
      setMessage(`Sign-in link not sent: ${error.message}`);
    } else {
      setState('sent');
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setState('idle');
    setMessage('');
  }

  return (
    <main className="signin">
      <img className="signin-logo" src="/launchpage-logo.png" alt="LaunchPage" />
      {state === 'sent' ? (
        <p className="signin-note">{linkedSent ? `${email} is linked to your account, so the sign-in link went to your account's sign-in email. Open it on this device.` : `Check ${email} for a sign-in link. Open it on this device.`}</p>
      ) : (
        <form onSubmit={submit} className="signin-form">
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
          {mode === 'password' && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button className="btn" type="submit" disabled={state === 'working'}>
            {mode === 'password'
              ? state === 'working' ? 'Signing in…' : 'Sign in'
              : state === 'working' ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
          {state === 'error' && <p className="signin-error">{message}</p>}
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(mode === 'password' ? 'link' : 'password')}
          >
            {mode === 'password' ? 'Use an email link instead' : 'Use a password instead'}
          </button>
        </form>
      )}
      <BetaRequest />
    </main>
  );
}
