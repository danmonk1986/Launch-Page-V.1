import { useState } from 'react';
import { DEFAULT_SETTINGS, INDUSTRIES, type AccountInfo, type BrandSettings } from '../lib/settings';
import { isoDate, openTabs, type Launch, type Rocket } from '../lib/rockets';
import type { Routine } from '../lib/routines';
import type { Project } from '../lib/projects';
import { whatList } from '../lib/whats';
import { cleanLink, joinTitle } from './Rockets';

/**
 * V20-308 (Dan, Nov 17): first-run setup, one step per page, from the white setup canvas (row C). Part 1: the page
 * frame (header, card, BACK / NEXT, progress) and step 1 · About you, with the 18+ stop. V20-309: steps 2–4
 * (Routine, Rocket, Timed launch), each saved on NEXT so setup resumes where it stopped. Shown when account.setup is a step number, or on a new account (no setup flag
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

const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const pad = (n: number) => String(n).padStart(2, '0');

export function Setup({
  settings,
  email,
  projects,
  onSave,
  onSignOut,
  onSaveRoutine,
  onSaveRocket,
  onSaveLaunch,
  onTest
}: {
  settings: BrandSettings;
  email: string;
  projects: Project[];
  onSave: (patch: Partial<BrandSettings>) => Promise<void>;
  onSignOut: () => void;
  onSaveRoutine: (r: Routine) => Promise<void>;
  onSaveRocket: (r: Rocket) => Promise<void>;
  onSaveLaunch: (l: Launch) => Promise<void>;
  /** Finish setup and open the launch pop-up for this launch. */
  onTest: (l: Launch) => void;
}) {
  const a = settings.account;
  const [step, setStep] = useState<SetupStep>(setupStepFor(a) ?? 1);
  const [busy, setBusy] = useState(false);
  // 1 · About you. A new account still carries the starter name; start it blank.
  const [name, setName] = useState(settings.displayName === DEFAULT_SETTINGS.displayName ? '' : settings.displayName);
  const [business, setBusiness] = useState(a.businessName);
  const [role, setRole] = useState(a.role);
  const [industry, setIndustry] = useState(a.industry);
  const [birthday, setBirthday] = useState(a.birthday);
  const [under, setUnder] = useState(false);
  const age = ageOn(birthday);
  // 2 · Routine (prefilled to keep setup quick).
  const [routineId] = useState(() => crypto.randomUUID());
  const [rName, setRName] = useState('Workday');
  const [wake, setWake] = useState('07:00');
  const [bed, setBed] = useState('23:00');
  const [blocks, setBlocks] = useState([
    { time: '09:00', label: 'Deep work' },
    { time: '11:30', label: 'Admin & email' },
    { time: '14:00', label: 'Client work' }
  ]);
  // 3 · Rocket.
  const [rocketId] = useState(() => crypto.randomUUID());
  const [kName, setKName] = useState('Deep work');
  const [links, setLinks] = useState(['https://www.notion.so', 'https://www.figma.com', 'https://soundcloud.com']);
  const [linkDraft, setLinkDraft] = useState('');
  // 4 · Timed launch: the first block that's still ahead today, else the next half hour.
  const [launchId] = useState(() => crypto.randomUUID());
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? '');
  const [what, setWhat] = useState('WORK BLOCK');
  const [desc, setDesc] = useState('Deep work');
  const [steps, setSteps] = useState<string[]>([]);
  const [stepDraft, setStepDraft] = useState('');
  const [atTime, setAtTime] = useState(() => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const ahead = ['09:00', '11:30', '14:00'].find((t) => hm(t) > mins);
    if (ahead) return ahead;
    const n = Math.min(23 * 60 + 30, Math.ceil((mins + 1) / 30) * 30);
    return `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
  });
  const [minutes, setMinutes] = useState(90);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [onDate, setOnDate] = useState(isoDate(new Date()));

  // V20-314: a one-time launch can't start at a time that's already gone today.
  const passed = repeat === 'once' && onDate <= isoDate(new Date()) && (onDate < isoDate(new Date()) || hm(atTime) <= new Date().getHours() * 60 + new Date().getMinutes());
  const allLinks = () => [...links, linkDraft].map(cleanLink).filter((u, i, all) => u && all.indexOf(u) === i);
  const okBlocks = blocks.filter((b) => b.label.trim());
  const ready =
    step === 1 ? !!name.trim() && age !== null : step === 2 ? !!rName.trim() && !!wake && !!bed : step === 3 ? !!kName.trim() && allLinks().length > 0 : !!what.trim() && !!atTime && !!onDate && !passed;

  const launchOf = (): Launch => ({
    id: launchId,
    title: joinTitle(what, desc),
    steps: [...steps, stepDraft].map((x) => x.trim()).filter(Boolean),
    atTime,
    repeat,
    weekdays: [1, 2, 3, 4, 5],
    monthDay: 1,
    onDate,
    minutes: Math.max(5, minutes || 30),
    urls: allLinks(),
    active: true,
    movedTo: null,
    sound: true,
    notify: false,
    logKind: 'productivity',
    projectId: projectId || null,
    sort: 0
  });

  async function saveStep(): Promise<boolean> {
    if (!ready || busy) return false;
    if (step === 1 && age! < 18) {
      setUnder(true);
      return false;
    }
    setBusy(true);
    try {
      if (step === 1) {
        await onSave({ displayName: name.trim(), account: { businessName: business.trim(), role: role.trim(), industry, birthday, setup: 2 } as AccountInfo });
      } else if (step === 2) {
        const items = [{ time: wake, label: 'Wake Up' }, ...okBlocks.map((b) => ({ time: b.time || null, label: b.label.trim() })), { time: bed, label: 'Bed' }];
        await onSaveRoutine({ id: routineId, name: rName.trim(), kind: 'routine', flips: false, shiftStart: null, shiftEnd: null, wake, bed, items, sort: 0 });
        await onSave({ account: { setup: 3 } as AccountInfo });
      } else if (step === 3) {
        const u = allLinks();
        await onSaveRocket({ id: rocketId, name: kName.trim().slice(0, 14), note: '', url: u[0], urls: u, color: 'teal', routineIds: [routineId], sort: 0 });
        await onSave({ account: { setup: 4 } as AccountInfo });
      } else {
        await onSaveLaunch(launchOf());
        await onSave({ account: { setup: 'done' } as AccountInfo });
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!(await saveStep())) return;
    if (step < 4) setStep((step + 1) as SetupStep);
  }

  const X = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
  const PLUS = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
  const ROCKET = (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
  const listRow = (value: string, label: string, onChange: (v: string) => void, onX: () => void, key: number) => (
    <li key={key}>
      <input value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="quick-btn quick-skip" aria-label={`Remove ${label}`} title="Remove" onClick={onX}>
        {X}
      </button>
    </li>
  );
  const draftRow = (value: string, placeholder: string, onChange: (v: string) => void, onAdd: () => void, onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void) => (
    <li>
      <input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <button type="button" className="quick-btn quick-skip" aria-label="Add" title="Add" disabled={!value.trim()} onClick={onAdd}>
        {PLUS}
      </button>
    </li>
  );

  const head = (n: number, title: string) => (
    <div className="setup-card-head">
      <h2>
        {n} · {title}
      </h2>
      {ready && <span>✓ Done</span>}
    </div>
  );

  // V20-317: each step's card contents, so steps 1–3 can stack in one spot (the tallest sets the height).
  const stepBody = (n: SetupStep) => (
    <>
              {n === 1 && (
                <>
                  {head(1, 'About you')}
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
                </>
              )}
              {n === 2 && (
                <>
                  {head(2, 'Your routine')}
                  <p>How does a normal day run? Start with three blocks.</p>
                  <label className="field">
                    <span>Name</span>
                    <input required value={rName} onChange={(e) => setRName(e.target.value)} />
                  </label>
                  <div className="setup-grid">
                    <label className="field">
                      <span>Wake up</span>
                      <input required type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Bed</span>
                      <input required type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
                    </label>
                  </div>
                  <div className="field">
                    <span>Blocks</span>
                    <ul className="setup-blocks">
                      {blocks.map((b, i) => (
                        <li key={i}>
                          <input type="time" aria-label={`Block ${i + 1} time`} value={b.time} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} />
                          <input aria-label={`Block ${i + 1}`} value={b.label} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                          <button type="button" className="quick-btn quick-skip" aria-label={`Remove block ${i + 1}`} title="Remove" onClick={() => setBlocks((l) => l.filter((_, j) => j !== i))}>
                            {X}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button type="button" className="welcome-link setup-add" onClick={() => setBlocks((l) => [...l, { time: '', label: '' }])}>
                    + Add a block
                  </button>
                </>
              )}
              {n === 3 && (
                <>
                  {head(3, 'Your first rocket')}
                  <p>Everything one block needs, opened with one tap.</p>
                  <label className="field">
                    <span>Name</span>
                    <input required maxLength={14} value={kName} onChange={(e) => setKName(e.target.value)} />
                  </label>
                  <div className="field steps-field">
                    <span>Links</span>
                    <ol className="lstep-list">
                      {links.map((u, i) => listRow(u, `Link ${i + 1}`, (v) => setLinks((l) => l.map((x, j) => (j === i ? v : x))), () => setLinks((l) => l.filter((_, j) => j !== i)), i))}
                      {draftRow(
                        linkDraft,
                        'Next link',
                        setLinkDraft,
                        () => {
                          const u = cleanLink(linkDraft);
                          if (u) setLinks((l) => [...l, u]);
                          setLinkDraft('');
                        },
                        (e) => {
                          const many = e.clipboardData.getData('text').split(/[\s,]+/).map(cleanLink).filter((u) => u && /[./]/.test(u));
                          if (many.length < 2) return;
                          e.preventDefault();
                          setLinks((l) => [...l, ...many.filter((u) => !l.includes(u))]);
                        }
                      )}
                    </ol>
                  </div>
                  <button type="button" className="welcome-btn setup-test" onClick={() => openTabs(allLinks())} disabled={!allLinks().length}>
                    Test {ROCKET}
                  </button>
                </>
              )}
              {n === 4 && (
                <>
                  {head(4, 'Attach it to a time')}
                  <p>At block time, L4UNCH P4GE pops up and launches the rocket.</p>
                  <div className="setup-grid">
                    <label className="field">
                      <span>Project</span>
                      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="">No project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>What</span>
                      <select
                        required
                        value={what}
                        onChange={(e) => {
                          setWhat(e.target.value);
                          const w = whatList().find((x) => x.name === e.target.value);
                          if (w) setMinutes(w.minutes);
                        }}
                      >
                        {whatList().map((w) => (
                          <option key={w.name} value={w.name}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>Description</span>
                    <input value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </label>
                  <div className="field steps-field">
                    <span>Steps</span>
                    <ol className="lstep-list">
                      {steps.map((x, i) => listRow(x, `Step ${i + 1}`, (v) => setSteps((l) => l.map((y, j) => (j === i ? v : y))), () => setSteps((l) => l.filter((_, j) => j !== i)), i))}
                      {draftRow(stepDraft, steps.length ? 'Next step' : 'A step (optional)', setStepDraft, () => {
                        if (stepDraft.trim()) setSteps((l) => [...l, stepDraft.trim()]);
                        setStepDraft('');
                      })}
                    </ol>
                  </div>
                  <div className="setup-grid">
                    <label className="field">
                      <span>Time</span>
                      <input required type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Time allotted (minutes)</span>
                      <input type="number" min={5} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
                    </label>
                    <label className="field">
                      <span>Repeats</span>
                      <select value={repeat} onChange={(e) => setRepeat(e.target.value as 'once' | 'weekly')}>
                        <option value="once">Once</option>
                        <option value="weekly">Weekdays</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{repeat === 'once' ? 'Date' : 'Starts'}</span>
                      <input required type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} />
                    </label>
                  </div>
                  {passed && (
                    <p className="field-error" role="alert">
                      That time has passed today. Pick a later time or another date.
                    </p>
                  )}
                  <p className="setup-fine">Rocket: {kName.trim() || 'your rocket'} · {allLinks().length} link{allLinks().length === 1 ? '' : 's'}</p>
                  <button
                    type="button"
                    className="welcome-btn welcome-key setup-test"
                    disabled={!ready || busy}
                    onClick={async () => {
                      if (await saveStep()) onTest(launchOf());
                    }}
                  >
                    Test {ROCKET}
                  </button>
                </>
              )}
    </>
  );

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
            {/* V20-317 (Dan, Nov 17): the buttons sit at the same spot on every step: steps 1–3 stack in one cell, so the
                card is always as tall as the tallest of them (step 4 to be tightened to fit). */}
            <div className="setup-stage">
              {([1, 2, 3] as SetupStep[])
                .filter((x) => x !== step)
                .map((x) => (
                  <fieldset key={x} className="setup-card setup-ghost" disabled aria-hidden="true" tabIndex={-1}>
                    {stepBody(x)}
                  </fieldset>
                ))}
            <form
              className="setup-card"
              onSubmit={(e) => {
                e.preventDefault();
                void next();
              }}
            >
              {stepBody(step)}
            </form>
            </div>
            <div className="setup-actions">
              {step > 1 && (
                <button type="button" className="welcome-btn" onClick={() => setStep((step - 1) as SetupStep)}>
                  Back
                </button>
              )}
              <button type="button" className="welcome-btn welcome-key" disabled={!ready || busy} onClick={() => void next()}>
                {busy ? 'Saving…' : step === 4 ? 'Finish' : 'Next'}
              </button>
            </div>
            <footer className="setup-progress">
              <ol>
                {STEPS.map((x, i) => (
                  <li key={x} className={i + 1 === step ? 'is-on' : i + 1 < step ? 'is-done' : ''}>
                    <b>{i + 1 < step ? '✓' : i + 1}</b>
                    {x}
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
