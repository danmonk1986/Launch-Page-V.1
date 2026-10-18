import { useEffect, useRef, useState } from 'react';

const KEY = 'launchpage.music.url';
const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * A SoundCloud link as the player accepts it: https://soundcloud.com/<artist>/<track or sets/name>,
 * without the share junk (?si=…&utm_…) or a #hash. Short on.soundcloud.com links can't be played.
 */
export function cleanLink(link: string): string | null {
  // SoundCloud's Share → Embed code works too: take the player's url= out of it.
  const embed = link.match(/w\.soundcloud\.com\/player\/\?[^"'\s>]*/i);
  if (embed) {
    const u = new URLSearchParams(embed[0].split('?')[1].replace(/&amp;/g, '&')).get('url');
    if (u && /^https:\/\/api\.soundcloud\.com\/(tracks|playlists|users)\/[\w:%-]+/i.test(u)) return u.split('&')[0];
    if (u) return cleanLink(u);
  }
  const m = link.trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com(\/[^?#\s]+)/i);
  return m ? `https://soundcloud.com${m[1].replace(/\/+$/, '')}` : null;
}

/** A SoundCloud link (track, playlist or profile) as the embeddable player's address, or null. */
export function soundcloudEmbed(link: string): string | null {
  const v = cleanLink(link);
  if (!v) return null;
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
  getSounds(cb: (s: ScSound[] | null) => void): void;
  getPosition(cb: (ms: number) => void): void;
  getCurrentSoundIndex(cb: (i: number) => void): void;
  seekTo(ms: number): void;
  skip(index: number): void;
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

// Saved playlists (per device) and where each one was left off.
type Saved = { name: string; link: string };
const SAVED_KEY = 'launchpage.music.saved';
const SPOT_KEY = 'launchpage.music.spot';
type Spot = { link: string; index: number; ms: number };
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** "…/sets/2026-you-can-change-this-is" → "2026 you can change this is". */
function linkName(link: string) {
  const parts = link.split('?')[0].split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return decodeURIComponent(last).replace(/[-_]+/g, ' ').trim() || 'SoundCloud';
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
  const [saved, setSaved] = useState<Saved[]>(() => readJson<Saved[]>(SAVED_KEY, []));
  const [listOpen, setListOpen] = useState<false | { top: number; right: number }>(false);
  const [resumed, setResumed] = useState('');
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
        // A playlist names its current track only once one plays: show its first track until then.
        const refresh = () =>
          w.getCurrentSound((s) => {
            if (!live) return;
            if (s?.title) return setSound(s);
            w.getSounds((list) => live && setSound((list ?? []).find((x) => x?.title) ?? null));
          });
        w.bind(E.READY, () => {
          if (!live) return;
          widget.current = w;
          setReady(true);
          refresh();
        });
        // Pick up where this playlist was left off: on the first ▶ (browsers only allow sound
        // after a press), jump to the saved track, then to the saved spot in it.
        const spot = readJson<Spot | null>(SPOT_KEY, null);
        let resume: Spot | null = spot && spot.link === link && (spot.index > 0 || spot.ms > 5000) ? spot : null;
        let lastSave = 0;
        w.bind(E.PLAY, () => {
          if (!live) return;
          setPlaying(true);
          refresh();
          if (!resume) return;
          const r = resume;
          w.getCurrentSoundIndex((i) => {
            if (i !== r.index) {
              w.skip(r.index); // plays the saved track; its own PLAY then seeks
              return;
            }
            resume = null;
            if (r.ms > 5000) w.seekTo(r.ms);
            setResumed(`Picked up where you left off`);
            setTimeout(() => live && setResumed(''), 4000);
          });
        });
        if (E.PLAY_PROGRESS)
          w.bind(E.PLAY_PROGRESS, () => {
            const now = Date.now();
            if (!live || now - lastSave < 5000) return;
            lastSave = now;
            w.getCurrentSoundIndex((index) => w.getPosition((ms) => writeJson(SPOT_KEY, { link, index, ms })));
          });
        w.bind(E.PAUSE, () => live && setPlaying(false));
        w.bind(E.ERROR, () => live && setFailed(true));
        w.bind(E.FINISH, () => live && setPlaying(false));
        w.bind(E.PAUSE, () => w.getCurrentSoundIndex((index) => w.getPosition((ms) => writeJson(SPOT_KEY, { link, index, ms }))));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [src]);

  const save = () => {
    const raw = draft.trim();
    if (raw && !soundcloudEmbed(raw)) return;
    const v = raw ? (cleanLink(raw) ?? '') : '';
    setLink(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setEditing(false);
  };
  // The playlists menu closes on a click anywhere else, or when the page scrolls.
  useEffect(() => {
    if (!listOpen) return;
    const off = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.music-list') && !t.closest('[aria-label="Your playlists"]')) setListOpen(false);
    };
    const shut = () => setListOpen(false);
    document.addEventListener('mousedown', off);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('mousedown', off);
      window.removeEventListener('resize', shut);
    };
  }, [listOpen]);
  const useLink = (v: string) => {
    setLink(v);
    setDraft(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setEditing(false);
    setListOpen(false);
  };
  const isSaved = saved.some((x) => x.link === link);
  const saveCurrent = () => {
    if (!link || isSaved) return;
    const name = linkName(link);
    const next = [...saved, { name: name.replace(/\b\w/g, (c) => c.toUpperCase()), link }];
    setSaved(next);
    writeJson(SAVED_KEY, next);
  };
  const forget = (l: string) => {
    const next = saved.filter((x) => x.link !== l);
    setSaved(next);
    writeJson(SAVED_KEY, next);
  };
  const tab = open ? 0 : -1;
  const art = sound?.artwork_url || sound?.user?.avatar_url || '';
  const title = sound?.title ?? (failed ? 'SoundCloud can’t play this link · ✎ to change it' : ready ? linkName(link) : 'Loading…');
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
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the soundcloud.com link (or Share → Embed code)" aria-label="SoundCloud link" tabIndex={tab} />
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
              {resumed ? <span className="music-who music-resumed">{resumed}</span> : who && <span className="music-who">{who}</span>}
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
              className={`music-ctl music-save${isSaved ? ' is-on' : ''}`}
              aria-label={isSaved ? 'Saved to your playlists' : 'Save this playlist'}
              title={isSaved ? 'Saved to your playlists' : 'Save this playlist'}
              tabIndex={tab}
              aria-pressed={isSaved}
              onClick={saveCurrent}
            >
              <Svg d="M6 3h12v18l-6-4-6 4z" size={14} fill={isSaved} />
            </button>
            <button
              type="button"
              className="music-ctl"
              aria-label="Your playlists"
              title="Your playlists"
              aria-expanded={!!listOpen}
              tabIndex={tab}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setListOpen((o) => (o ? false : { top: r.bottom + 8, right: window.innerWidth - r.right - 60 }));
              }}
            >
              <Svg d="M4 6h11M4 12h11M4 18h7M19 9v9M15.5 14.5 19 18l3.5-3.5" size={15} />
            </button>
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
      {open && listOpen && (
        <div className="music-list" role="menu" aria-label="Your playlists" style={{ top: listOpen.top, right: listOpen.right }}>
          {saved.length === 0 && <p className="music-list-empty">No saved playlists yet. Play one and press the bookmark to save it.</p>}
          {saved.map((x) => (
            <div key={x.link} className={`music-list-row${x.link === link ? ' is-current' : ''}`}>
              <button type="button" role="menuitem" className="music-list-pick" onClick={() => useLink(x.link)} title={x.link}>
                {x.name}
              </button>
              <button type="button" className="music-ctl" aria-label={`Remove ${x.name}`} title="Remove from your playlists" onClick={() => forget(x.link)}>
                <Svg d="M6 6l12 12M18 6L6 18" size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="music-list-new"
            onClick={() => {
              setListOpen(false);
              setDraft('');
              setEditing(true);
            }}
          >
            + Add a playlist link
          </button>
        </div>
      )}
      {/* SoundCloud's own player: always loaded, so music survives closing the panel. Shown under 🎧
          while the panel is open: browsers only let music start from a press inside it, and after
          that the mini player's buttons drive it. */}
      {src && (
        <iframe
          key={src}
          ref={frame}
          className={`music-engine${open && !editing ? ' is-shown' : ''}`}
          title="SoundCloud player"
          src={src}
          allow="autoplay; encrypted-media"
          tabIndex={open && !editing ? 0 : -1}
          aria-hidden={!(open && !editing)}
        />
      )}
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
