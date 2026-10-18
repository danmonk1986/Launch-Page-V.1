import { useEffect, useRef, useState } from 'react';

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

// SoundCloud's Widget API: our buttons drive the (hidden) SoundCloud player.
interface ScSound {
  title?: string;
  artwork_url?: string | null;
  user?: { username?: string; avatar_url?: string };
}
interface ScWidget {
  bind(event: string, cb: () => void): void;
  play(): void;
  pause(): void;
  next(): void;
  prev(): void;
  getCurrentSound(cb: (s: ScSound | null) => void): void;
}
type ScGlobal = { Widget: ((el: HTMLIFrameElement) => ScWidget) & { Events: Record<string, string> } };
let apiLoad: Promise<ScGlobal> | null = null;
function loadApi(): Promise<ScGlobal> {
  const w = window as unknown as { SC?: ScGlobal };
  if (w.SC) return Promise.resolve(w.SC);
  apiLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://w.soundcloud.com/player/api.js';
    s.async = true;
    s.onload = () => (w.SC ? resolve(w.SC) : reject(new Error('no SC')));
    s.onerror = () => {
      apiLoad = null;
      reject(new Error('SoundCloud did not load'));
    };
    document.head.appendChild(s);
  });
  return apiLoad;
}

const Svg = ({ d, size = 16, fill = false }: { d: string; size?: number; fill?: boolean }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PLAY = 'M7 4v16l13-8z';
const PAUSE = 'M7 4h3v16H7zM14 4h3v16h-3z';
const PREV = 'M19 20 9 12l10-8zM5 19V5';
const NEXT = 'M5 4l10 8-10 8zM19 5v14';
const EDIT = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4';

/**
 * 🎧 beside ⚙: a mini player (artwork, title, ⏮ ▶ ⏭) slides out to the left in the header.
 * SoundCloud's own player runs hidden behind it, so music keeps playing when it's closed.
 * The link is kept per device.
 */
export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(read);
  const [editing, setEditing] = useState(() => !read());
  const [draft, setDraft] = useState(link);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState<ScSound | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const widget = useRef<ScWidget | null>(null);
  const src = soundcloudEmbed(link);

  useEffect(() => {
    setReady(false);
    setPlaying(false);
    setSound(null);
    setFailed(false);
    widget.current = null;
    if (!src || !frame.current) return;
    let live = true;
    loadApi()
      .then((SC) => {
        if (!live || !frame.current) return;
        const w = SC.Widget(frame.current);
        const E = SC.Widget.Events;
        const refresh = () => w.getCurrentSound((s) => live && setSound(s));
        w.bind(E.READY, () => {
          if (!live) return;
          widget.current = w;
          setReady(true);
          refresh();
        });
        w.bind(E.PLAY, () => {
          if (!live) return;
          setPlaying(true);
          refresh();
        });
        w.bind(E.PAUSE, () => live && setPlaying(false));
        w.bind(E.FINISH, () => live && setPlaying(false));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [src]);

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
  const tab = open ? 0 : -1;
  const art = sound?.artwork_url || sound?.user?.avatar_url || '';
  const title = sound?.title ?? (failed ? 'SoundCloud didn’t load' : ready ? 'Ready' : 'Loading…');
  const who = sound?.user?.username ?? '';

  return (
    <div className={`music${open ? ' is-open' : ''}${playing ? ' is-playing' : ''}`}>
      <div className="music-panel" aria-hidden={!open}>
        {editing || !src ? (
          <form
            className="music-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a SoundCloud playlist or track link" aria-label="SoundCloud link" tabIndex={tab} />
            <button type="submit" className="icon-btn tool-btn tool-btn-go" aria-label="Use this link" title="Use this link" tabIndex={tab} disabled={!!draft.trim() && !soundcloudEmbed(draft)}>
              <Svg d={PLAY} />
            </button>
          </form>
        ) : (
          <div className="music-mini">
            <span className="music-art" aria-hidden="true">
              {art ? <img src={art.replace('-large', '-t67x67')} alt="" /> : <Svg d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />}
            </span>
            <span className="music-meta" title={who ? `${title} · ${who}` : title}>
              <span className="music-title">{title}</span>
              {who && <span className="music-who">{who}</span>}
            </span>
            <span className="music-controls">
              <button type="button" className="music-ctl" aria-label="Previous" title="Previous" tabIndex={tab} disabled={!ready} onClick={() => widget.current?.prev()}>
                <Svg d={PREV} size={14} fill />
              </button>
              <button type="button" className="music-ctl music-play" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} tabIndex={tab} disabled={!ready} onClick={() => (playing ? widget.current?.pause() : widget.current?.play())}>
                <Svg d={playing ? PAUSE : PLAY} size={14} fill />
              </button>
              <button type="button" className="music-ctl" aria-label="Next" title="Next" tabIndex={tab} disabled={!ready} onClick={() => widget.current?.next()}>
                <Svg d={NEXT} size={14} fill />
              </button>
            </span>
            <button
              type="button"
              className="icon-btn tool-btn music-change"
              aria-label="Change the music link"
              title="Change the music link"
              tabIndex={tab}
              onClick={() => {
                setDraft(link);
                setEditing(true);
              }}
            >
              <Svg d={EDIT} size={14} />
            </button>
          </div>
        )}
      </div>
      {/* SoundCloud's own player: always loaded (so music survives closing the panel), never shown. */}
      {src && <iframe key={src} ref={frame} className="music-engine" title="SoundCloud player" src={src} allow="autoplay; encrypted-media" tabIndex={-1} aria-hidden="true" />}
      <button
        type="button"
        className={`icon-btn tool-btn gear-btn music-btn${open ? ' is-on' : ''}`}
        aria-label={open ? 'Hide the music player' : 'Music'}
        aria-expanded={open}
        title={open ? 'Hide the music player (it keeps playing)' : playing ? 'Music · playing' : 'Music'}
        onClick={() => setOpen((o) => !o)}
      >
        <Svg d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      </button>
    </div>
  );
}
