import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'password' | 'link';
type State = 'idle' | 'working' | 'sent' | 'error';

export function SignIn() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setState('working');
    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState('error');
        setMessage(
          error.message === 'Invalid login credentials'
            ? 'Email or password is wrong. No password yet? Sign in with an email link, then set one in Brand settings.'
            : error.message
        );
      }
      // On success the auth listener in App swaps this screen for the dashboard.
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
        <p className="signin-note">Check {email} for a sign-in link. Open it on this device.</p>
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
    </main>
  );
}
