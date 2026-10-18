import { useState } from 'react';

const KEY = 'launchpage.music.url';
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/** A SoundCloud link (track, playlist or profile) as the embeddable player's address, or null. */
export function soundcloudEmbed(link: string): string | null {
  const v = link.trim();
  if (!/^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\//i.test(v)) return null;
  const q = new URLSearchParams({ url: v, color: '#06f9c2', auto_play: 'false', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false', visual: 'false' });
  return `https://w.soundcloud.com/player/?${q.toString()}`;
}

/**
 * 🎧 beside ⚙: opens a SoundCloud player to the left, in the header. The player stays loaded
 * when it's closed, so the music keeps playing. The link is kept per device.
 */
export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(read);
  const [editing, setEditing] = useState(() => !read());
  const [draft, setDraft] = useState(link);
  const src = soundcloudEmbed(link);
  const save = () => {
    const v = draft.trim();
    if (v && !soundcloudEmbed(v)) return;
    setLink(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setEditing(false);
  };
  return (
    <div className={`music${open ? ' is-open' : ''}`}>
      <div className="music-panel" aria-hidden={!open}>
        {editing || !src ? (
          <form
            className="music-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste a SoundCloud playlist or track link"
              aria-label="SoundCloud link"
              tabIndex={open ? 0 : -1}
            />
            <button type="submit" className="icon-btn tool-btn tool-btn-go" aria-label="Play this" title="Play this" tabIndex={open ? 0 : -1} disabled={!!draft.trim() && !soundcloudEmbed(draft)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 4v16l13-8z" />
              </svg>
            </button>
          </form>
        ) : null}
        {src && (
          <div className={`music-frame${editing ? ' is-hidden' : ''}`}>
            <iframe title="SoundCloud player" src={src} allow="autoplay; encrypted-media" loading="lazy" tabIndex={open ? 0 : -1} />
            <button
              type="button"
              className="icon-btn tool-btn music-change"
              aria-label="Change the music link"
              title="Change the music link"
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setDraft(link);
                setEditing(true);
              }}
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`icon-btn tool-btn gear-btn music-btn${open ? ' is-on' : ''}`}
        aria-label={open ? 'Hide the music player' : 'Music'}
        aria-expanded={open}
        title={open ? 'Hide the music player (it keeps playing)' : 'Music'}
        onClick={() => setOpen((o) => !o)}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </button>
    </div>
  );
}
