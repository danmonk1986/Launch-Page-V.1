import { useEffect, useRef, useState } from 'react';

/**
 * Music (V12-019, Oct 25). The user story: you're listening to music or a podcast in the browser,
 * a thinking moment hits, and you want to pause and play without breaking your rhythm.
 *
 * 🎧 opens a small card: paste a link (SoundCloud, YouTube, Spotify, an audio file) or pick a
 * saved one. LaunchPage opens its own player window (/player.html) with that link's official
 * player; 🎧 then becomes a rocket that plays and pauses it. ▾ beside it changes the link, brings
 * the window forward, or closes it. The two talk on the "launchpage-player" BroadcastChannel.
 */

type PlayerState = 'loading' | 'playing' | 'paused' | 'needs-click' | 'error' | 'closed';
type Saved = { name: string; link: string };

const LINK_KEY = 'launchpage.music.url';
const SAVED_KEY = 'launchpage.music.saved';
const WINDOW_NAME = 'launchpage-player';

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
const readLink = () => {
  try {
    return localStorage.getItem(LINK_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Which player a link opens in, or null when none can play it. */
export function linkKind(link: string): 'SoundCloud' | 'YouTube' | 'Spotify' | 'Audio file' | null {
  const s = link.trim();
  if (/soundcloud\.com\//i.test(s)) return 'SoundCloud';
  if (/(?:youtube\.com|youtu\.be)\/\S*(?:[?&](?:v|list)=|youtu\.be\/[\w-]{6,}|\/(?:shorts|live|embed)\/)/i.test(s)) return 'YouTube';
  if (/open\.spotify\.com\/(?:intl-\w+\/)?(?:track|album|playlist|episode|show|artist)\//i.test(s)) return 'Spotify';
  if (/^https?:\/\/\S+\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?\S*)?$/i.test(s)) return 'Audio file';
  return null;
}

/** A short name for a link: the last part of its address, tidied. */
function linkName(link: string) {
  try {
    const u = new URL(/^https?:/i.test(link) ? link : `https://${link}`);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const name = decodeURIComponent(last).replace(/\.\w{2,4}$/, '').replace(/[-_]+/g, ' ').trim();
    if (name && !/^(watch|playlist)$/i.test(name)) return name.replace(/\b\w/g, (c) => c.toUpperCase());
    return `${linkKind(link) ?? 'Music'} ${u.searchParams.get('list') ? 'playlist' : 'link'}`;
  } catch {
    return 'Music';
  }
}

const Svg = ({ d, size = 16, fill = false }: { d: string; size?: number; fill?: boolean }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const HEADPHONES = 'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z';
const ROCKET =
  'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5';
const PLAY = 'M7 4v16l13-8z';
const PAUSE = 'M7 4h3v16H7zM14 4h3v16h-3z';
const CARET = 'M6 9l6 6 6-6';
const CLOSE = 'M6 6l12 12M18 6L6 18';

export function MusicPlayer() {
  const [card, setCard] = useState(false);
  const [draft, setDraft] = useState(readLink);
  const [link, setLink] = useState(readLink);
  const [saved, setSaved] = useState<Saved[]>(() => readJson<Saved[]>(SAVED_KEY, []));
  const [state, setState] = useState<PlayerState>('closed');
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const heard = useRef(0);
  const win = useRef<Window | null>(null);
  const chan = useRef<BroadcastChannel | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Listen to the player window; it says hello every 2 seconds while it's open.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const c = new BroadcastChannel(WINDOW_NAME);
    chan.current = c;
    c.onmessage = (e: MessageEvent) => {
      const m = (e.data ?? {}) as { state?: PlayerState; title?: string; url?: string };
      if (!m.state) return;
      if (m.state === 'closed') {
        heard.current = 0;
        setState('closed');
        return;
      }
      heard.current = Date.now();
      setState(m.state);
      if (m.title) setTitle(m.title);
      if (m.state === 'needs-click') setHint('Click Start once in the player window. After that the rocket plays and pauses.');
      if (m.state === 'playing') setHint('');
    };
    c.postMessage({ cmd: 'hello' }); // a player window left open from before
    const tick = window.setInterval(() => {
      if (heard.current && Date.now() - heard.current > 6000) {
        heard.current = 0;
        setState('closed');
      }
    }, 2000);
    return () => {
      window.clearInterval(tick);
      c.close();
      chan.current = null;
    };
  }, []);

  // The card closes on a click outside it.
  useEffect(() => {
    if (!card) return;
    const off = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setCard(false);
    };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [card]);

  const open = state !== 'closed';
  const send = (cmd: string, url?: string) => chan.current?.postMessage({ cmd, url });

  /** Opens (or reuses) the player window with this link. */
  const launch = (raw: string) => {
    const v = raw.trim();
    if (!linkKind(v)) return setHint('Paste a SoundCloud, YouTube, Spotify or audio-file link.');
    setLink(v);
    setDraft(v);
    try {
      localStorage.setItem(LINK_KEY, v);
    } catch {
      /* ignore */
    }
    const url = `/player.html?url=${encodeURIComponent(v)}`;
    if (open) {
      send('load', v);
      win.current?.focus();
    } else {
      const w = window.open(url, WINDOW_NAME, 'popup,width=460,height=560');
      if (!w) return setHint('The browser blocked the player window. Allow pop-ups for LaunchPage, then try again.');
      win.current = w;
      heard.current = Date.now();
      setState('loading');
    }
    setTitle('');
    setHint('');
    setCard(false);
  };

  const front = () => {
    // After a reload LaunchPage no longer holds the window: reopening by name finds it without reloading it.
    const w = win.current && !win.current.closed ? win.current : window.open('', WINDOW_NAME);
    if (w) {
      win.current = w;
      w.focus();
    }
  };
  const close = () => {
    const w = win.current && !win.current.closed ? win.current : window.open('', WINDOW_NAME);
    w?.close();
    heard.current = 0;
    setState('closed');
    setTitle('');
    setHint('');
    setCard(false);
  };

  const isSaved = saved.some((x) => x.link === link);
  const saveLink = () => {
    if (!link || isSaved) return;
    const next = [...saved, { name: title ? title.split(' · ')[0] : linkName(link), link }];
    setSaved(next);
    writeJson(SAVED_KEY, next);
  };
  const forget = (l: string) => {
    const next = saved.filter((x) => x.link !== l);
    setSaved(next);
    writeJson(SAVED_KEY, next);
  };

  const playing = state === 'playing';
  const rocketLabel = state === 'needs-click' ? 'Start the music in the player window' : playing ? `Pause${title ? `: ${title}` : ''}` : `Play${title ? `: ${title}` : ''}`;

  return (
    <div className={`music${open ? ' is-live' : ''}${playing ? ' is-playing' : ''}`} ref={wrap}>
      {open ? (
        <div className="music-rocket-group">
          <button
            type="button"
            className={`icon-btn tool-btn gear-btn music-btn music-rocket${playing ? ' is-on' : ''}`}
            aria-label={rocketLabel}
            title={rocketLabel}
            onClick={() => (state === 'needs-click' ? front() : send('toggle'))}
          >
            <Svg d={ROCKET} />
            <span className="music-badge" aria-hidden="true">
              <Svg d={playing ? PAUSE : PLAY} size={9} fill />
            </span>
          </button>
          <button type="button" className="icon-btn tool-btn music-caret" aria-label="Music options" aria-expanded={card} title="Change the link, show or close the player" onClick={() => setCard((o) => !o)}>
            <Svg d={CARET} size={14} />
          </button>
        </div>
      ) : (
        <button type="button" className={`icon-btn tool-btn gear-btn music-btn${card ? ' is-on' : ''}`} aria-label="Music" aria-expanded={card} title="Music: open a player you can pause from here" onClick={() => setCard((o) => !o)}>
          <Svg d={HEADPHONES} />
        </button>
      )}

      {card && (
        <div className="music-card" role="dialog" aria-label="Music">
          {open && (
            <div className="music-now">
              <span className="music-now-title" title={title || linkName(link)}>
                {playing ? '▶ ' : '❚❚ '}
                {title || linkName(link)}
              </span>
              <span className="music-now-actions">
                <button type="button" className="btn btn-quiet" onClick={front}>
                  Show player
                </button>
                <button
                  type="button"
                  className={`music-ctl music-save${isSaved ? ' is-on' : ''}`}
                  aria-pressed={isSaved}
                  aria-label={isSaved ? 'Saved to your list' : 'Save this link'}
                  title={isSaved ? 'Saved to your list' : 'Save this link'}
                  onClick={saveLink}
                >
                  <Svg d="M6 3h12v18l-6-4-6 4z" size={14} fill={isSaved} />
                </button>
                <button type="button" className="btn btn-quiet music-stop" onClick={close}>
                  Close player
                </button>
              </span>
            </div>
          )}
          <form
            className="music-form"
            onSubmit={(e) => {
              e.preventDefault();
              launch(draft);
            }}
          >
            <input
              value={draft}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value);
                setHint('');
              }}
              placeholder="Paste a SoundCloud, YouTube, Spotify or audio link"
              aria-label="Music link"
            />
            <button type="submit" className="icon-btn tool-btn tool-btn-go" aria-label={open ? 'Play this instead' : 'Open the player'} title={open ? 'Play this instead' : 'Open the player'} disabled={!linkKind(draft)}>
              <Svg d={ROCKET} size={15} />
            </button>
          </form>
          <p className="field-hint music-kind">{draft.trim() ? (linkKind(draft) ? `${linkKind(draft)} · opens in its own small window` : 'That link can’t be played here.') : 'Find the playlist or video, copy its link, paste it here.'}</p>
          {saved.length > 0 && (
            <ul className="music-saved" aria-label="Saved links">
              {saved.map((x) => (
                <li key={x.link} className={x.link === link && open ? 'is-current' : ''}>
                  <button type="button" className="music-saved-pick" title={x.link} onClick={() => launch(x.link)}>
                    {x.name}
                    <span className="music-saved-kind">{linkKind(x.link) ?? ''}</span>
                  </button>
                  <button type="button" className="music-ctl" aria-label={`Remove ${x.name}`} title="Remove from your list" onClick={() => forget(x.link)}>
                    <Svg d={CLOSE} size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hint && <p className="field-hint music-hint-text">{hint}</p>}
        </div>
      )}
      {!card && hint && (
        <p className="music-toast" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
