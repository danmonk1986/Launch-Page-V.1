import { useState } from 'react';
import { BOOKS_LOGO, booksPath } from '../lib/beta';
import { supabase } from '../lib/supabase';
import { BetaRequest } from './BetaRequest';

type State = 'idle' | 'signing' | 'sending' | 'sent' | 'error';

/** V20-294: onBack returns to Welcome. V20-297 (Dan, Nov 17): sign in and sign up are two pages: signUp shows
 *  only the beta request (the sign-up track for now), sign in shows only the sign-in form.
 *  V20-326 (COPY CP-013 to 015, Nov 18): one form, no toggles: Email · Password · SIGN IN · EMAIL ME A SIGN-IN LINK
 *  (the link goes to the email typed above). */
export function SignIn({ signUp = false, onBack, notice = null }: { signUp?: boolean; onBack?: () => void; notice?: string | null } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>(notice ? 'error' : 'idle');
  const [message, setMessage] = useState(notice ?? '');
  const [linkedSent, setLinkedSent] = useState(false);
  const busy = state === 'signing' || state === 'sending';

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setState('signing');
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
          ? "That email or password doesn't match. No password yet? Tap EMAIL ME A SIGN-IN LINK, then set one in ⚙ › Account Information."
          : error.message
      );
    }
    // On success the auth listener in App swaps this screen for the dashboard.
  }

  async function sendLink() {
    if (!supabase || busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setState('error');
      setMessage('Type your email above first.');
      return;
    }
    setState('sending');
    // V20-118: a linked email gets its link sent to the account's sign-in email.
    const { data: linked } = await supabase.functions
      .invoke('email-sign-in', { body: { mode: 'link', email, redirectTo: window.location.origin } })
      .catch(() => ({ data: null }));
    if (linked?.linked) {
      setLinkedSent(true);
      setState('sent');
      return;
    }
    // V20-428 (Nov 20; was V20-420, redone on its own): a sign-in link never creates an account. The beta is invite-only, and a link for an unknown
    // email used to make a brand-new account (no invite needed).
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (error) {
      setState('error');
      const wait = /after (\d+) seconds/i.exec(error.message)?.[1];
      if (/signups? not allowed|not found|user.*not.*exist/i.test(error.message)) setMessage("There's no account for that email yet. Tap ← Back, then REQUEST AN INVITE.");
      else if (wait) setMessage(`A link was just sent. Wait ${wait} seconds, then try again.`);
      else setMessage(`Sign-in link not sent: ${error.message}`);
    } else setState('sent');
  }

  if (signUp) {
    return (
      <main className="signin signin-light">
        <img className="signin-logo" src={booksPath() ? BOOKS_LOGO : '/launchpage-logo.png'} alt={booksPath() ? 'BOOKS' : 'L4UNCH P4GE'} />
        <BetaRequest startOpen onBack={onBack} />
      </main>
    );
  }

  return (
    <main className="signin signin-light">
      <img className="signin-logo" src={booksPath() ? BOOKS_LOGO : '/launchpage-logo.png'} alt={booksPath() ? 'BOOKS' : 'L4UNCH P4GE'} />
      {state === 'sent' ? (
        <p className="signin-note">{linkedSent ? `${email} is linked to your account, so the sign-in link went to your account's sign-in email. Open it on this device.` : `Check ${email} for a sign-in link. Open it on this device.`}</p>
      ) : (
        <form onSubmit={signIn} className="signin-form">
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="signin-actions">
            <button className="btn" type="submit" disabled={busy}>
              {state === 'signing' ? 'Signing in…' : 'Sign in'}
            </button>
            <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => void sendLink()}>
              {state === 'sending' ? 'Sending your link…' : 'Email me a sign-in link'}
            </button>
          </div>
          {state === 'error' && <p className="signin-error">{message}</p>}
        </form>
      )}
      {onBack && (
        <button type="button" className="link-btn signin-back" onClick={onBack}>
          ← Back
        </button>
      )}
    </main>
  );
}
