import { useEffect, useRef, useState } from 'react';
import { shrinkImage } from '../lib/images';
import { BACKGROUNDS, type Background, type BrandSettings } from '../lib/settings';
import type { ScrollMode } from '../lib/view';
import { CLOSE_ICON, HeadIcon, SAVE_ICON, useClickOff } from './Sheet';

const BG_LABEL: Record<Background, string> = {
  synthwave: 'Synthwave',
  night: 'Starry night',
  navy: 'Navy',
  damascus: 'Damascus',
  snow: 'Snowy day',
  white: 'White'
};

type Props = {
  open: boolean;
  /** Brand settings (name, logo, headline, scrolling, password) or Colour settings (background, night and day colours). */
  section: 'brand' | 'colours';
  settings: BrandSettings;
  onClose: () => void;
  onSave: (s: BrandSettings) => Promise<void>;
  /** Scrolling style for this device; changes straight away. */
  scrollMode: ScrollMode;
  onScrollMode: (m: ScrollMode) => void;
  /** Present only when signed in to the cloud. Returns an error message, or null on success. */
  onSetPassword?: (password: string) => Promise<string | null>;
};

export function SettingsPanel({ open, section, settings, onClose, onSave, onSetPassword, scrollMode, onScrollMode }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwStatus, setPwStatus] = useState('');
  const clickOff = useClickOff(onClose);

  useEffect(() => setDraft(settings), [settings, open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({ ...draft, logoUrl: draft.logoUrl?.trim() || null });
    setSaving(false);
    onClose();
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!onSetPassword) return;
    if (newPassword.length < 8) {
      setPwStatus('Use at least 8 characters.');
      return;
    }
    setPwStatus('Saving password…');
    const error = await onSetPassword(newPassword);
    setPwStatus(error ? `Password not saved: ${error}` : 'Password saved. Use it to sign in on any device.');
    if (!error) setNewPassword('');
  }

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="settings-title" {...clickOff}>
      <form onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="settings-title">{section === 'brand' ? 'Brand settings' : 'Colour settings'}</h2>
          <div className="sheet-tools">
            <button type="submit" className="icon-btn tool-btn tool-btn-go" disabled={saving} aria-label="Save settings" title="Save">
              <HeadIcon d={SAVE_ICON} />
            </button>
            <button type="button" className="icon-btn tool-btn" onClick={onClose} aria-label="Close settings" title="Close">
              <HeadIcon d={CLOSE_ICON} />
            </button>
          </div>
        </div>

        {section === 'brand' && (
          <>
        <label className="field">
          <span>Your name</span>
          <input value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} />
        </label>
        <label className="field">
          <span>Logo text</span>
          <input value={draft.logoText} onChange={(e) => set('logoText', e.target.value)} />
        </label>
        <ImagePick
          label="Logo (optional, replaces the LaunchPage logo)"
          hint="Ideal: 600 × 110 px. PNG keeps a see-through background; JPEG works too. Shown 54 px tall."
          value={draft.logoUrl}
          wide
          shrink={{ maxW: 1200, maxH: 220, type: 'image/png' }}
          onChange={(v) => set('logoUrl', v)}
        />
        <label className="field">
          <span>Headline (top bar)</span>
          <input value={draft.goal} onChange={(e) => set('goal', e.target.value)} />
        </label>
        <label className="field">
          <span>Mantra</span>
          <input value={draft.mantra} onChange={(e) => set('mantra', e.target.value)} />
        </label>
          </>
        )}

        {section === 'brand' && (
        <fieldset className="field">
          <legend>Scrolling (this device)</legend>
          <div className="choice-row">
            <label className="choice">
              <input type="radio" name="scroll" checked={scrollMode === 'free'} onChange={() => onScrollMode('free')} />
              <span>Free</span>
            </label>
            <label className="choice">
              <input type="radio" name="scroll" checked={scrollMode === 'cards'} onChange={() => onScrollMode('cards')} />
              <span>Card by card</span>
            </label>
          </div>
          <p className="field-hint">Card by card: each scroll lands on the next card, and the routine stays fixed beside them, following the time.</p>
        </fieldset>

        )}
        {section === 'colours' && (
          <>
        <fieldset className="field">
          <legend>Background</legend>
          <div className="choice-row">
            {BACKGROUNDS.map((b) => (
              <label key={b} className="choice">
                <input
                  type="radio"
                  name="background"
                  checked={draft.background === b}
                  onChange={() => set('background', b)}
                />
                <span>{BG_LABEL[b]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>Your own background (optional, replaces the one picked above)</legend>
          <div className="bg-picks">
            <ImagePick label="Night mode" value={draft.nightBgImage} shrink={{ maxW: 2560, maxH: 1600, type: 'image/jpeg', quality: 0.8 }} onChange={(v) => set('nightBgImage', v)} />
            <ImagePick label="Day mode" value={draft.dayBgImage} shrink={{ maxW: 2560, maxH: 1600, type: 'image/jpeg', quality: 0.8 }} onChange={(v) => set('dayBgImage', v)} />
          </div>
          <p className="field-hint">Ideal: 2560 × 1440 px JPEG (16:9). Night mode shows on Synthwave, Starry night and Navy; Day mode on Damascus, Snowy day and White.</p>
        </fieldset>

        <fieldset className="field">
          <legend>Night mode colours · Synthwave, Starry night, Navy</legend>
          <div className="swatches">
            <ColourField label="Purple" value={draft.accentPurple} onChange={(v) => set('accentPurple', v)} />
            <ColourField label="Teal" value={draft.accentTeal} onChange={(v) => set('accentTeal', v)} />
            <ColourField label="Green" value={draft.accentGreen} onChange={(v) => set('accentGreen', v)} />
            <ColourField label="Pink" value={draft.accentPink} onChange={(v) => set('accentPink', v)} />
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Day mode colours · Damascus, Snowy day, White</legend>
          <div className="swatches">
            <ColourField label="Purple" value={draft.dayPurple} onChange={(v) => set('dayPurple', v)} />
            <ColourField label="Teal" value={draft.dayTeal} onChange={(v) => set('dayTeal', v)} />
            <ColourField label="Green" value={draft.dayGreen} onChange={(v) => set('dayGreen', v)} />
            <ColourField label="Pink" value={draft.dayPink} onChange={(v) => set('dayPink', v)} />
          </div>
          <p className="field-hint">Purple and Teal run the app; all four are rocket colours. Tap a swatch to pick (the dropper picks from the screen), or paste a hex code.</p>
        </fieldset>
          </>
        )}
      </form>

      {section === 'brand' && onSetPassword && (
        <form className="account" onSubmit={submitPassword}>
          <h3 className="account-title">Sign-in password</h3>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <div className="sheet-actions">
            <button type="submit" className="btn btn-quiet">
              Set password
            </button>
          </div>
          {pwStatus && (
            <p className="account-status" role="status">
              {pwStatus}
            </p>
          )}
        </form>
      )}
    </dialog>
  );
}

/** One colour: the picker (gradient + dropper) and a box to paste a hex code. */
function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const commit = (raw: string) => {
    const v = raw.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase());
    else if (/^#[0-9a-f]{3}$/i.test(v)) onChange(`#${v.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase());
    else setHex(value);
  };
  return (
    <div className="field swatch colour-field">
      <span>{label}</span>
      <div className="colour-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
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
    </div>
  );
}

/** Pick an image from the computer: shrunk in the browser, previewed, and removable. */
function ImagePick({
  label,
  hint,
  value,
  wide,
  shrink,
  onChange
}: {
  label: string;
  hint?: string;
  value: string | null;
  wide?: boolean;
  shrink: { maxW: number; maxH: number; type: 'image/jpeg' | 'image/png'; quality?: number };
  onChange: (v: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className={`field image-pick${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      <div className="image-pick-row">
        <div className={`image-pick-preview${value ? '' : ' is-empty'}`}>{value ? <img src={value} alt="" /> : 'None'}</div>
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
              onChange(await shrinkImage(f, shrink));
            } catch (err) {
              setError((err as Error).message);
            }
            setBusy(false);
          }}
        />
        <button type="button" className="btn btn-quiet image-pick-btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading…' : value ? 'Change' : 'Choose image'}
        </button>
        {value && (
          <button type="button" className="btn btn-quiet image-pick-btn" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
      {error && <p className="field-hint image-pick-error">{error}</p>}
    </div>
  );
}
