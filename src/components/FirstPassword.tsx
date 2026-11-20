import { useState } from 'react';

/**
 * V20-418/V20-430 (Dan): someone who arrives by invite or email link and has never set a password is sent straight here
 * to set one, before setup or the Launch Page. New password twice, the same rules as Settings. "Later" lets them
 * carry on (it asks again next time they sign in with a link); ⚙ › Account Information › Set a password works too.
 */
export function FirstPassword({ email, onSave, onLater, reset = false }: { email: string | null; onSave: (password: string) => Promise<string | null>; onLater: () => void; reset?: boolean }) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rules = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: /[a-z]/.test(next) && /[A-Z]/.test(next), text: 'Upper and lower case letters' },
    { ok: /[0-9]/.test(next), text: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(next), text: 'A symbol (! ? # …)' }
  ];
  const matches = !!again && next === again;
  const ready = rules.every((r) => r.ok) && matches && !busy;
  const kind = show ? 'text' : 'password';
  return (
    <main className="signin signin-light first-password">
      <img className="signin-logo" src="/launchpage-logo.png" alt="L4UNCH P4GE" />
      <form
        className="signin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready) return;
          setBusy(true);
          setErr(null);
          const error = await onSave(next);
          setBusy(false);
          if (error) setErr(`Password not set: ${error}`);
        }}
      >
        <p className="beta-title">{reset ? 'Set a new password' : 'Set a password'}</p>
        <p className="field-hint">{reset ? 'You opened a password reset link. Choose a new password for this account.' : 'Set a password so you can sign in on any device without waiting for an email.'}</p>
        {email && <input type="email" value={email} autoComplete="username" readOnly hidden />}
        <label className="field">
          <span>New password</span>
          <input type={kind} required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <ul className="pw-rules" aria-label="Password rules">
          {rules.map((r) => (
            <li key={r.text} className={r.ok ? 'is-ok' : undefined}>
              <span aria-hidden="true">{r.ok ? '✓' : '·'}</span> {r.text}
            </li>
          ))}
        </ul>
        <label className="field">
          <span>New password again</span>
          <input type={kind} required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {again && !matches && <p className="field-hint pw-bad">The two passwords don’t match.</p>}
        <label className="check-line">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show passwords</span>
        </label>
        {err && <p className="signin-error">{err}</p>}
        <div className="tour-actions beta-actions">
          <button type="button" className="welcome-btn" onClick={onLater}>
            {reset ? 'Cancel' : 'Later'}
          </button>
          <button type="submit" className="welcome-btn welcome-key" disabled={!ready}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </main>
  );
}
