import { useEffect, useRef, useState, type ReactNode } from 'react';
import { shrinkImage } from '../lib/images';
import { BG_NAME, DAY_TILES, DESCRIBES, INDUSTRIES, NIGHT_TILES, flipDayNight, isDay, withBackground, type AccountInfo, type Background, type BgMode, type BgSlots, type BrandSettings } from '../lib/settings';
import { CLOSE_ICON, HeadIcon, SAVE_ICON, useClickOff } from './Sheet';
import { FoldTabs } from './FoldTabs';


/** V20-111 (Dan, Nov 12): Settings is a wide pop-out window with tabs across the top (like Timed launches and Tasks). */
export type SettingsTab = 'account' | 'appearance' | 'modules' | 'projects' | 'data' | 'privacy' | 'signout';
export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'account', label: 'Account Information' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'modules', label: 'Modules' },
  { id: 'projects', label: 'Projects' },
  { id: 'data', label: 'Data Management' },
  { id: 'privacy', label: 'Privacy Statement' },
  { id: 'signout', label: 'Sign Out' }
];

/** One thing you can do in Data Management (export, import, disconnect). */
export type DataAction = { label: string; hint: string; button: string; onClick: () => void };

type Props = {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  settings: BrandSettings;
  onClose: () => void;
  onSave: (s: BrandSettings) => Promise<void>;
  /** Present only when signed in to the cloud. Returns an error message, or null on success. */
  onSetPassword?: (password: string) => Promise<string | null>;
  /** True when the password is the one this account signs in with. */
  onCheckPassword?: (password: string) => Promise<boolean>;
  /** Emails a reset link to the sign-in email. Returns an error message, or null. */
  onSendReset?: () => Promise<string | null>;
  /** The sign-in email, when signed in. */
  email?: string | null;
  /** V20-129: your own background images in the tile slots, and how to change one. */
  bgSlots: BgSlots;
  onBgImage: (mode: BgMode, slot: number, image: string | null) => void;
  /** The Projects tab (moved here from the Tasks page's folder button). */
  projects: ReactNode;
  data: DataAction[];
  onSignOut?: () => void;
};

export function SettingsPanel({ open, tab, onTab, settings, onClose, onSave, onSetPassword, onCheckPassword, onSendReset, email, projects, data, onSignOut, bgSlots, onBgImage }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [pwOpen, setPwOpen] = useState(false);
  const clickOff = useClickOff(onClose);

  // V20-119 (Dan, Nov 12): Account Information and Appearance save themselves, like the journal: 0.9 s after the
  // last change, and straight away when the window closes. No Save button.
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;
  const [saveState, setSaveState] = useState<'' | 'typing' | 'saved'>('');
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (!dirty.current) return;
    dirty.current = false;
    const d = latest.current;
    void saveRef.current({ ...d, logoUrl: d.logoUrl?.trim() || null });
    setSaveState('saved');
  };
  // A newer copy from the cloud or another device replaces the form only when nothing is waiting to save.
  useEffect(() => {
    if (!dirty.current) setDraft(settings);
  }, [settings]);
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setSaveState('');
    } else flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const queue = (fn: (d: BrandSettings) => BrandSettings) => {
    setDraft((d) => {
      const next = fn(d);
      latest.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState('typing');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
  };
  // The day / night switch applies and saves at once (no 0.9 s wait).
  const saveNow = (fn: (d: BrandSettings) => BrandSettings) => {
    const next = fn(latest.current);
    latest.current = next;
    setDraft(next);
    dirty.current = true;
    flush();
  };
  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => queue((d) => ({ ...d, [k]: v }));
  const acct = draft.account;
  const setAcct = <K extends keyof AccountInfo>(k: K, v: AccountInfo[K]) => queue((d) => ({ ...d, account: { ...d.account, [k]: v } }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    flush();
  }


  // Account Information and Appearance share one draft and one Save.
  const saves = tab === 'account' || tab === 'appearance';
  const current = SETTINGS_TABS.find((t) => t.id === tab)!;

  return (
    <dialog ref={ref} className="sheet sheet-settings" onClose={onClose} aria-labelledby="settings-title" {...clickOff}>
      <div className="sheet-head">
        <h2 id="settings-title">Settings</h2>
        <div className="sheet-tools">
          {saves && (
            <span className="journal-state settings-save-state" aria-live="polite">
              {saveState === 'typing' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </span>
          )}
          {/* V20-120 (Dan, Nov 12): day and night switch (sun | moon), beside where Save was. Each side goes to its own
              remembered background and saves straight away. */}
          <div className="daynight" role="group" aria-label="Day or night">
            <button type="button" className="daynight-btn" aria-pressed={isDay(draft.background)} aria-label="Day mode" title="Day mode" onClick={() => saveNow((d) => flipDayNight(d, true))}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            </button>
            <button type="button" className="daynight-btn" aria-pressed={!isDay(draft.background)} aria-label="Night mode" title="Night mode" onClick={() => saveNow((d) => flipDayNight(d, false))}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            </button>
          </div>
          {/* V20-121 (Dan, Nov 12): order is switch, Save, × (cancel). Save stays too. Everything already saves itself; Save saves now and closes the window. */}
          <button
            type="button"
            className="icon-btn tool-btn tool-btn-go"
            aria-label="Save and close"
            title="Save"
            onClick={() => {
              dirty.current = true;
              flush();
              onClose();
            }}
          >
            <HeadIcon d={SAVE_ICON} />
          </button>
          <button type="button" className="icon-btn tool-btn" onClick={onClose} aria-label="Close settings" title="Close">
            <HeadIcon d={CLOSE_ICON} />
          </button>
        </div>
      </div>
      <FoldTabs label="Settings" items={SETTINGS_TABS} value={tab} onPick={onTab} />

      <div className="settings-body" role="tabpanel" aria-label={current.label}>
        <form id="settings-form" onSubmit={submit} hidden={!saves}>
          {tab === 'account' && (
            <>
              {/* V20-113 (Dan, Nov 12): who you are and your business, two to a row. */}
              <div className="settings-grid">
                <label className="field">
                  <span>Name</span>
                  <input value={draft.displayName} autoComplete="name" onChange={(e) => set('displayName', e.target.value)} />
                </label>
                <div className="field">
                  <label className="field-label" htmlFor="acct-alias">
                    Alias
                  </label>
                  <input id="acct-alias" value={acct.alias} onChange={(e) => setAcct('alias', e.target.value)} />
                  <label className="check-line">
                    <input type="checkbox" checked={acct.hideRealName} onChange={(e) => setAcct('hideRealName', e.target.checked)} />
                    <span>Hide my real name (show the alias instead)</span>
                  </label>
                </div>
                <label className="field">
                  <span>Business name</span>
                  <input value={acct.businessName} autoComplete="organization" onChange={(e) => setAcct('businessName', e.target.value)} />
                </label>
                <label className="field">
                  <span>Role</span>
                  <input value={acct.role} autoComplete="organization-title" placeholder="e.g. Founder" onChange={(e) => setAcct('role', e.target.value)} />
                </label>
                {/* V20-117: two drop-downs for data collection, each with Other (then a box to type it). */}
                <PickOther label="Industry" options={INDUSTRIES} value={acct.industry} other={acct.industryOther} onValue={(v) => setAcct('industry', v)} onOther={(v) => setAcct('industryOther', v)} />
                <PickOther label="What best describes you" options={DESCRIBES} value={acct.describes} other={acct.describesOther} onValue={(v) => setAcct('describes', v)} onOther={(v) => setAcct('describesOther', v)} />
                <label className="field">
                  <span>Sign-in email</span>
                  <input value={email ?? 'Not signed in'} readOnly aria-readonly="true" className="is-readonly" />
                </label>
                <div className="field">
                  <label className="field-label" htmlFor="acct-backup">
                    Backup email
                  </label>
                  <input id="acct-backup" type="email" value={acct.backupEmail} autoComplete="email" onChange={(e) => setAcct('backupEmail', e.target.value)} />
                  {/* V20-118 (Dan, Nov 12): both emails sign in (and count for anything email-related later). */}
                  <label className="check-line">
                    <input type="checkbox" checked={acct.linkEmails} disabled={!acct.backupEmail.trim()} onChange={(e) => setAcct('linkEmails', e.target.checked)} />
                    <span>Sync both emails (sign in with either)</span>
                  </label>
                </div>
                <label className="field">
                  <span>Birthday</span>
                  <input type="date" value={acct.birthday} autoComplete="bday" onChange={(e) => setAcct('birthday', e.target.value)} />
                </label>
                <label className="field">
                  <span>Business founded (if applicable)</span>
                  <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(acct.businessFounded) ? acct.businessFounded : ''} onChange={(e) => setAcct('businessFounded', e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>Address</span>
                <input value={acct.street} autoComplete="street-address" placeholder="Street and number" onChange={(e) => setAcct('street', e.target.value)} />
              </label>
              <div className="settings-grid settings-grid-4">
                <label className="field">
                  <span>City</span>
                  <input value={acct.city} autoComplete="address-level2" onChange={(e) => setAcct('city', e.target.value)} />
                </label>
                <label className="field">
                  <span>Province / State</span>
                  <input value={acct.region} autoComplete="address-level1" onChange={(e) => setAcct('region', e.target.value)} />
                </label>
                <label className="field">
                  <span>Postal code</span>
                  <input value={acct.postalCode} autoComplete="postal-code" onChange={(e) => setAcct('postalCode', e.target.value.toUpperCase())} />
                </label>
                <label className="field">
                  <span>Country</span>
                  <input value={acct.country} autoComplete="country-name" onChange={(e) => setAcct('country', e.target.value)} />
                </label>
              </div>
            </>
          )}

          {tab === 'appearance' && (
            <>
              {/* V20-128 (Dan, Nov 12): Appearance is in sections; the first is BRAND (logo, headline, mantra). Same look as
                  the TIMED LAUNCHES heading: colour 2, its font and size. */}
              <h3 className="timed-title settings-section">Brand</h3>
              {/* V20-124 (Dan's sketch, Nov 12): one logo box, 600 × 110. Type in it and your words show in the L4UNCH P4GE
                  lettering; Choose image beside it uploads a file into the same box instead. */}
              <LogoField
                text={draft.logoText}
                image={draft.logoUrl}
                onText={(v) => set('logoText', v)}
                onImage={(v) => set('logoUrl', v)}
              />
              <label className="field">
                <span>Headline (top bar)</span>
                <input value={draft.goal} onChange={(e) => set('goal', e.target.value)} />
              </label>
              <label className="field">
                <span>Mantra</span>
                <input value={draft.mantra} onChange={(e) => set('mantra', e.target.value)} />
              </label>


              {/* V20-129 (Dan, Nov 12): BACKGROUND, a row of five tiles for day and for night. Four backgrounds (any can be
                  swapped for your own image; deleting it brings the default back) and a colour. Picking one makes it that
                  mode's background (the sun / moon switch goes to it) and shows it now. */}
              <h3 className="timed-title settings-section">Background</h3>
              {(['day', 'night'] as const).map((mode) => (
                <BgRow
                  key={mode}
                  mode={mode}
                  current={draft.background}
                  colour={mode === 'day' ? draft.dayColour : draft.nightColour}
                  palette={mode === 'day' ? [draft.dayPurple, draft.dayTeal, draft.dayGreen, draft.dayPink, '#f5f5eb', '#ffffff'] : [draft.accentPurple, draft.accentTeal, draft.accentGreen, draft.accentPink, '#0b0820', '#1a1338']}
                  slots={bgSlots[mode]}
                  onPick={(bg) => saveNow((d) => withBackground(d, bg))}
                  onColour={(hex) => saveNow((d) => withBackground(mode === 'day' ? { ...d, dayColour: hex } : { ...d, nightColour: hex }, `${mode}-colour`))}
                  onImage={(slot, image) => {
                    onBgImage(mode, slot, image);
                    const imgId = `${mode}-img-${slot}` as Background;
                    if (image) saveNow((d) => withBackground(d, imgId));
                    else if (latest.current.background === imgId || latest.current[mode === 'day' ? 'dayBackground' : 'nightBackground'] === imgId)
                      saveNow((d) => withBackground(d, (mode === 'day' ? DAY_TILES : NIGHT_TILES)[slot]));
                  }}
                />
              ))}

              {/* V20-130 (Dan, Nov 12): COLOURS, laid out like BACKGROUND: Day (light) and Night (dark), one tile per colour. */}
              <h3 className="timed-title settings-section">Colours</h3>
              {(['day', 'night'] as const).map((mode) => {
                const keys = (mode === 'day' ? ['dayPurple', 'dayTeal', 'dayGreen', 'dayPink'] : ['accentPurple', 'accentTeal', 'accentGreen', 'accentPink']) as (keyof BrandSettings)[];
                return (
                  <div key={mode} className="field bg-row">
                    <div className="bg-row-head">
                      <span className="field-label">{mode === 'day' ? 'Day (light)' : 'Night (dark)'}</span>
                    </div>
                    <div className="bg-tiles">
                      {keys.map((k, i) => (
                        <ColourTile key={k} label={['Purple', 'Teal', 'Green', 'Pink'][i]} note={i < 2 ? `Colour ${i + 1}` : 'Rockets'} value={draft[k] as string} onChange={(v) => set(k, v as never)} />
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="field-hint">Purple (colour 1) and Teal (colour 2) run the app; all four are rocket colours. Tap a swatch to pick (the dropper picks from the screen), or paste a hex code.</p>
            </>
          )}
        </form>

        {tab === 'account' && onSetPassword && (
          <div className="settings-action">
            <div>
              <p className="settings-action-title">Password</p>
              <p className="field-hint">Change the password you sign in with on any device.</p>
            </div>
            <button type="button" className="btn btn-quiet" onClick={() => setPwOpen(true)}>
              Change password
            </button>
          </div>
        )}
        {onSetPassword && <PasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} email={email ?? null} onSetPassword={onSetPassword} onCheckPassword={onCheckPassword} onSendReset={onSendReset} />}

        {tab === 'modules' && <p className="settings-note">Coming next: switch each card on the Launch Page on or off.</p>}

        {tab === 'projects' && projects}

        {tab === 'data' && (
          <div className="settings-actions">
            {data.map((a) => (
              <div key={a.label} className="settings-action">
                <div>
                  <p className="settings-action-title">{a.label}</p>
                  <p className="field-hint">{a.hint}</p>
                </div>
                <button type="button" className="btn btn-quiet" onClick={a.onClick}>
                  {a.button}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'privacy' && <p className="settings-note">Coming next: the privacy statement, drafted for Dan to review.</p>}

        {tab === 'signout' && (
          <div className="settings-action">
            <div>
              <p className="settings-action-title">Sign out</p>
              <p className="field-hint">{email ? `Signed in as ${email}. ` : ''}Signing out clears this device's copy; everything stays saved in your account.</p>
            </div>
            <button type="button" className="btn btn-danger" onClick={onSignOut} disabled={!onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}

/**
 * V20-113 (Dan, Nov 12): Change password in its own pop-out window. Current password (checked first), the new one
 * twice, rules shown as you type, show / hide, and a reset link for when the current one is forgotten.
 */
function PasswordDialog({
  open,
  onClose,
  email,
  onSetPassword,
  onCheckPassword,
  onSendReset
}: {
  open: boolean;
  onClose: () => void;
  email: string | null;
  onSetPassword: (password: string) => Promise<string | null>;
  onCheckPassword?: (password: string) => Promise<boolean>;
  onSendReset?: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const clickOff = useClickOff(onClose);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (open) {
      setCurrent('');
      setNext('');
      setAgain('');
      setShow(false);
      setStatus(null);
    }
  }, [open]);
  const rules = [
    { ok: next.length >= 8, text: 'At least 8 characters' },
    { ok: /[a-z]/.test(next) && /[A-Z]/.test(next), text: 'Upper and lower case letters' },
    { ok: /[0-9]/.test(next), text: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(next), text: 'A symbol (! ? # …)' },
    { ok: !!next && next !== current, text: 'Different from the current password' }
  ];
  const matches = !!again && next === again;
  const ready = !!current && rules.every((r) => r.ok) && matches && !busy;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setStatus(null);
    if (onCheckPassword && !(await onCheckPassword(current))) {
      setBusy(false);
      setStatus({ ok: false, text: 'That isn’t your current password.' });
      return;
    }
    const error = await onSetPassword(next);
    setBusy(false);
    if (error) return setStatus({ ok: false, text: `Password not changed: ${error}` });
    setStatus({ ok: true, text: 'Password changed. Use the new one to sign in on any device.' });
    setCurrent('');
    setNext('');
    setAgain('');
  }
  const kind = show ? 'text' : 'password';
  return (
    <dialog ref={ref} className="sheet sheet-password" onClose={onClose} aria-labelledby="pw-title" {...clickOff}>
      <form onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="pw-title">Change password</h2>
          <div className="sheet-tools">
            <button type="submit" className="icon-btn tool-btn tool-btn-go" disabled={!ready} aria-label="Save new password" title="Save">
              <HeadIcon d={SAVE_ICON} />
            </button>
            <button type="button" className="icon-btn tool-btn" onClick={onClose} aria-label="Close" title="Close">
              <HeadIcon d={CLOSE_ICON} />
            </button>
          </div>
        </div>
        {email && <input type="email" value={email} autoComplete="username" readOnly hidden />}
        <label className="field">
          <span>Current password</span>
          <input type={kind} required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
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
        {again && !matches && <p className="field-hint pw-bad">The two new passwords don’t match.</p>}
        <label className="check-line">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show passwords</span>
        </label>
        {status && (
          <p className={`account-status${status.ok ? '' : ' pw-bad'}`} role="status">
            {status.text}
          </p>
        )}
        {onSendReset && email && (
          <p className="field-hint">
            Forgot your current password?{' '}
            <button
              type="button"
              className="link-btn link-btn-inline"
              onClick={async () => {
                const err = await onSendReset();
                setStatus(err ? { ok: false, text: `Reset link not sent: ${err}` } : { ok: true, text: `A reset link is on its way to ${email}.` });
              }}
            >
              Email me a reset link
            </button>
          </p>
        )}
      </form>
    </dialog>
  );
}

/** V20-117: a drop-down whose last option, Other, opens a box to type your own. */
function PickOther({ label, options, value, other, onValue, onOther }: { label: string; options: string[]; value: string; other: string; onValue: (v: string) => void; onOther: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        <select value={value} onChange={(e) => onValue(e.target.value)}>
          <option value="">Pick one</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {value === 'Other' && <input aria-label={`${label}: other`} placeholder="Type yours" value={other} autoFocus onChange={(e) => onOther(e.target.value)} />}
    </div>
  );
}

/** V20-124: the logo box. Typed text previews in the hand lettering; an uploaded image fills the box instead. */
function LogoField({ text, image, onText, onImage }: { text: string; image: string | null; onText: (v: string) => void; onImage: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="field logo-field">
      <label className="field-label" htmlFor="logo-text">
        Logo
      </label>
      <div className="logo-row">
        <div className={`logo-box${image ? ' has-image' : ''}`}>
          {image ? (
            <img src={image} alt="Your logo" />
          ) : (
            <input id="logo-text" className="logo-type" value={text} placeholder="Type your logo" maxLength={24} spellCheck={false} onChange={(e) => onText(e.target.value)} />
          )}
        </div>
        <div className="logo-tools">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              setError('');
              try {
                onImage(await shrinkImage(f, { maxW: 1200, maxH: 220, type: 'image/png', trim: true }));
              } catch (err) {
                setError((err as Error).message);
              }
              setBusy(false);
            }}
          />
          <button type="button" className="btn btn-quiet image-pick-btn" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Reading…' : image ? 'Change image' : 'Choose image'}
          </button>
          {image && (
            <button type="button" className="btn btn-quiet image-pick-btn" onClick={() => onImage(null)}>
              Use text
            </button>
          )}
        </div>
      </div>
      <p className="field-hint">600 × 110 px at most: an image is trimmed and fitted inside it. Type your name or brand and it’s drawn in the L4UNCH P4GE lettering, or upload an image (PNG keeps a see-through background). Leave it empty for the L4UNCH!P4GE logo.</p>
      {error && <p className="field-hint image-pick-error">{error}</p>}
    </div>
  );
}

/** V20-129: the preview picture for a built-in tile. */
const tilePreview = (id: string) => (['planets', 'vats', 'corridor', 'starship'].includes(id) ? `/backgrounds/${id}.svg` : `/backgrounds/previews/${id}.jpg`);

/**
 * V20-129: one mode's five tiles. Each shows a little screen with its name and a tick underneath. Add image asks which
 * of the four to replace, so the row stays at five; × on your image brings that tile's default back.
 */
function BgRow({ mode, current, colour, palette, slots, onPick, onColour, onImage }: {
  mode: BgMode;
  current: Background;
  colour: string;
  palette: string[];
  slots: (string | null)[];
  onPick: (b: Background) => void;
  onColour: (hex: string) => void;
  onImage: (slot: number, image: string | null) => void;
}) {
  const tiles = mode === 'day' ? DAY_TILES : NIGHT_TILES;
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const colourId = `${mode}-colour` as Background;
  return (
    <div className="field bg-row">
      <div className="bg-row-head">
        <span className="field-label">{mode === 'day' ? 'Day (light)' : 'Night (dark)'}</span>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setError('');
            try {
              setPending(await shrinkImage(f, { maxW: 2560, maxH: 1600, type: 'image/jpeg', quality: 0.8 }));
            } catch (err) {
              setError((err as Error).message);
            }
            setBusy(false);
          }}
        />
        {pending ? (
          <span className="bg-replace-ask">
            Tap the tile your image replaces
            <button type="button" className="link-btn link-btn-inline" onClick={() => setPending(null)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-quiet bg-add" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? 'Reading…' : 'Add image'}
          </button>
        )}
      </div>
      <div className={`bg-tiles${pending ? ' is-replacing' : ''}`}>
        {tiles.map((t, slot) => {
          const img = slots[slot];
          const id = (img ? `${mode}-img-${slot}` : t) as Background;
          const on = current === id;
          const pick = () => {
            if (pending) {
              onImage(slot, pending);
              setPending(null);
            } else onPick(id);
          };
          return (
            <div key={t} className={`bg-tile${on ? ' is-on' : ''}`}>
              <button type="button" className="bg-screen" onClick={pick} aria-label={pending ? `Replace ${img ? 'your image' : BG_NAME[t]}` : `Use ${img ? 'your image' : BG_NAME[t]}`}>
                <img src={img ?? tilePreview(t)} alt="" loading="lazy" />
                {pending && <span className="bg-replace">Replace</span>}
              </button>
              {img && !pending && (
                <button type="button" className="bg-remove" aria-label={`Remove your image (${BG_NAME[t]} comes back)`} title={`Remove (${BG_NAME[t]} comes back)`} onClick={() => onImage(slot, null)}>
                  ×
                </button>
              )}
              <label className="bg-name">
                <input type="radio" name={`bg-${mode}`} checked={on} onChange={pick} />
                <span>{img ? 'Your image' : BG_NAME[t]}</span>
              </label>
            </div>
          );
        })}
        <div className={`bg-tile${current === colourId ? ' is-on' : ''}`}>
          <button type="button" className="bg-screen bg-colour" style={{ background: colour }} onClick={() => !pending && onPick(colourId)} aria-label="Use a colour" disabled={!!pending} />
          <div className="bg-dots" role="group" aria-label="Colour">
            {palette.map((c) => (
              <button key={c} type="button" className={`bg-dot${c.toLowerCase() === colour.toLowerCase() ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => onColour(c)} />
            ))}
            <label className="bg-dot bg-dot-pick" title="Any colour">
              +
              <input type="color" value={colour} onChange={(e) => onColour(e.target.value)} aria-label="Pick any colour" />
            </label>
          </div>
          <label className="bg-name">
            <input type="radio" name={`bg-${mode}`} checked={current === colourId} onChange={() => onPick(colourId)} />
            <span>Colour</span>
          </label>
        </div>
      </div>
      {error && <p className="field-hint image-pick-error">{error}</p>}
    </div>
  );
}

/** V20-130: one colour as a tile: a swatch shaped like the background tiles (tap to pick), its name, and the hex code. */
function ColourTile({ label, note, value, onChange }: { label: string; note: string; value: string; onChange: (v: string) => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const commit = (raw: string) => {
    const v = raw.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
    else if (/^#[0-9a-f]{3}$/i.test(v)) onChange(`#${v.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase());
    else setHex(value);
  };
  return (
    <div className="bg-tile colour-tile">
      <label className="bg-screen colour-swatch" style={{ background: value }} title={`Pick ${label}`}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
      </label>
      <span className="bg-name colour-name">
        {label} <small>{note}</small>
      </span>
      <input
        className="colour-hex"
        value={hex}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          setHex(e.target.value);
          if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit((e.target as HTMLInputElement).value))}
        aria-label={`${label} hex code`}
      />
    </div>
  );
}


