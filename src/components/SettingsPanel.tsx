import { useEffect, useRef, useState } from 'react';
import type { Background, BrandSettings } from '../lib/settings';

type Props = {
  open: boolean;
  settings: BrandSettings;
  onClose: () => void;
  onSave: (s: BrandSettings) => Promise<void>;
};

export function SettingsPanel({ open, settings, onClose, onSave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);

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

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="settings-title">
      <form onSubmit={submit}>
        <div className="sheet-head">
          <h2 id="settings-title">Brand settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <label className="field">
          <span>Your name</span>
          <input value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} />
        </label>
        <label className="field">
          <span>Logo text</span>
          <input value={draft.logoText} onChange={(e) => set('logoText', e.target.value)} />
        </label>
        <label className="field">
          <span>Logo image link (optional, replaces the text)</span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={draft.logoUrl ?? ''}
            onChange={(e) => set('logoUrl', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Goal</span>
          <input value={draft.goal} onChange={(e) => set('goal', e.target.value)} />
        </label>
        <label className="field">
          <span>Mantra</span>
          <input value={draft.mantra} onChange={(e) => set('mantra', e.target.value)} />
        </label>

        <fieldset className="field">
          <legend>Background</legend>
          <div className="choice-row">
            {(['synthwave', 'night', 'plain'] as Background[]).map((b) => (
              <label key={b} className="choice">
                <input
                  type="radio"
                  name="background"
                  checked={draft.background === b}
                  onChange={() => set('background', b)}
                />
                <span>{b === 'synthwave' ? 'Synthwave' : b === 'night' ? 'Night sky' : 'Plain'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="swatches">
          <label className="field swatch">
            <span>Purple</span>
            <input type="color" value={draft.accentPurple} onChange={(e) => set('accentPurple', e.target.value)} />
          </label>
          <label className="field swatch">
            <span>Teal</span>
            <input type="color" value={draft.accentTeal} onChange={(e) => set('accentTeal', e.target.value)} />
          </label>
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
