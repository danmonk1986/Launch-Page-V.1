import { useState } from 'react';
import { DEFAULT_SETTINGS, INDUSTRIES, type AccountInfo, type BrandSettings } from '../lib/settings';

/**
 * V20-308 (Dan, Nov 17): first-run setup, one step per page, from the white setup canvas (row C). Part 1: the page
 * frame (header, card, BACK / NEXT, progress) and step 1 · About you, with the 18+ stop. Steps 2–4 (Routine,
 * Rocket, Timed launch) come next. Shown when account.setup is a step number, or on a new account (no setup flag
 * and no birthday yet); existing accounts skip it. ⚙ › Data management › Run setup again sets it back to step 1.
 */
export type SetupStep = 1 | 2 | 3 | 4;

/** Should setup show for this account? */
export function setupStepFor(a: AccountInfo): SetupStep | null {
  if (a.setup === 'done') return null;
  if (typeof a.setup === 'number') return a.setup as SetupStep;
  return a.birthday.trim() ? null : 1;
}

function ageOn(birthday: string, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  let age = today.getFullYear() - Number(m[1]);
  const before = today.getMonth() + 1 < Number(m[2]) || (today.getMonth() + 1 === Number(m[2]) && today.getDate() < Number(m[3]));
  if (before) age -= 1;
  return age;
}

const STEPS = ['Account', 'Routine', 'Rocket', 'Timed launch'];

export function Setup({ settings, email, onSave, onSignOut }: { settings: BrandSettings; email: string; onSave: (patch: Partial<BrandSettings>) => Promise<void>; onSignOut: () => void }) {
  const a = settings.account;
  // A new account still carries the starter name; start it blank.
  const [name, setName] = useState(settings.displayName === DEFAULT_SETTINGS.displayName ? '' : settings.displayName);
  const [business, setBusiness] = useState(a.businessName);
  const [role, setRole] = useState(a.role);
  const [industry, setIndustry] = useState(a.industry);
  const [birthday, setBirthday] = useState(a.birthday);
  const [under, setUnder] = useState(false);
  const [busy, setBusy] = useState(false);
  const step: SetupStep = 1;
  const age = ageOn(birthday);
  const ready = !!name.trim() && age !== null;

  async function next() {
    if (!ready || busy) return;
    if (age! < 18) return setUnder(true);
    setBusy(true);
    // Part 1: About you finishes setup; steps 2–4 slot in here next (setup: 2).
    await onSave({ displayName: name.trim(), account: { businessName: business.trim(), role: role.trim(), industry, birthday, setup: 'done' } as AccountInfo });
    setBusy(false);
  }

  return (
    <main className="setup">
      <header className="setup-head">
        <img src="/launchpage-logo.png" alt="L4UNCH P4GE" />
        <h1>Set up your first launch</h1>
        <span className="setup-beta">BETA · about 10 min</span>
      </header>
      <div className="setup-main">
        {under ? (
          <section className="setup-card setup-stop">
            <h2>The beta is 18+ for now</h2>
            <p>
              Thanks for checking out L4UNCH P4GE. The beta is for people 18 and over, so we can't set up your account yet.
              <br />
              We'll be in touch at {email} when it opens up.
            </p>
            <button type="button" className="welcome-btn" onClick={onSignOut}>
              Back to start
            </button>
          </section>
        ) : (
          <>
            <form
              className="setup-card"
              onSubmit={(e) => {
                e.preventDefault();
                void next();
              }}
            >
              <div className="setup-card-head">
                <h2>1 · About you</h2>
                {ready && <span>✓ Done</span>}
              </div>
              <p>Who's launching? A minute here, then we build your day.</p>
              <div className="setup-grid">
                <label className="field">
                  <span>Name</span>
                  <input required value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Email · from your invite</span>
                  <input value={email} readOnly aria-readonly="true" className="is-readonly" />
                </label>
                <label className="field">
                  <span>Business name</span>
                  <input value={business} autoComplete="organization" onChange={(e) => setBusiness(e.target.value)} />
                </label>
                <label className="field">
                  <span>Role</span>
                  <input value={role} autoComplete="organization-title" placeholder="e.g. Founder" onChange={(e) => setRole(e.target.value)} />
                </label>
                <label className="field">
                  <span>Industry</span>
                  <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Pick one</option>
                    {INDUSTRIES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Birthday</span>
                  <input required type="date" value={birthday} autoComplete="bday" onChange={(e) => setBirthday(e.target.value)} />
                </label>
              </div>
              <p className="setup-fine">The beta is for 18 and over. The rest of your account (alias, address, backup email) lives in ⚙ › Account Information whenever you want it.</p>
            </form>
            <div className="setup-actions">
              <button type="button" className="welcome-btn welcome-key" disabled={!ready || busy} onClick={() => void next()}>
                {busy ? 'Saving…' : 'Next'}
              </button>
            </div>
            <footer className="setup-progress">
              <ol>
                {STEPS.map((s, i) => (
                  <li key={s} className={i + 1 === step ? 'is-on' : i + 1 < step ? 'is-done' : ''}>
                    <b>{i + 1 < step ? '✓' : i + 1}</b>
                    {s}
                  </li>
                ))}
              </ol>
              <span>About 10 minutes, start to first launch</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
