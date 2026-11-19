import { useLayoutEffect, useRef, useState } from 'react';
import { RocketIcon } from './RocketIcon';
import { FEATURE_COPY, type FeatureKey } from '../lib/featureCopy';

/**
 * V20-295 (Dan, Nov 17): the MVP tour, from the white setup canvas (board B). Welcome is slide 1; this is slides 2–6.
 * Each slide pairs a small picture of the real feature with a short headline. Dot 1 and BACK on the first slide go
 * back to Welcome; START LAUNCHING! and Skip go to sign up (the beta request). V20-296: logo colours; the dots sit
 * in the same place as on Welcome, with the text above them.
 */
// V20-326: the slides' words come from the shared feature copy (the same words show on each card's title hover).
const SLIDES = (['timed', 'rockets', 'routine', 'tasks', 'logging'] as FeatureKey[]).map((k) => FEATURE_COPY[k]);

export function Tour({ start = 0, onWelcome, onSignUp }: { start?: number; onWelcome: () => void; onSignUp: () => void }) {
  const [i, setI] = useState(Math.max(0, Math.min(SLIDES.length - 1, start)));
  const last = i === SLIDES.length - 1;
  // V20-412 (Dan, Nov 19): on phones the picture sits centred between the logo and this slide's headline. The words
  // are pinned from the bottom and their height changes slide to slide, so measure where the headline starts.
  const main = useRef<HTMLElement>(null);
  const logo = useRef<HTMLImageElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const m = main.current, l = logo.current, c = copy.current;
      if (!m || !l || !c) return;
      const top = m.getBoundingClientRect().top;
      m.style.setProperty('--logo-bottom', `${Math.round(l.getBoundingClientRect().bottom - top)}px`);
      m.style.setProperty('--copy-top', `${Math.round(c.getBoundingClientRect().top - top)}px`);
    };
    place();
    const r = new ResizeObserver(place);
    if (copy.current) r.observe(copy.current);
    if (logo.current) r.observe(logo.current);
    window.addEventListener('resize', place);
    return () => {
      r.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [i]);
  return (
    <main className="tour" ref={main}>
      <img className="tour-logo" src="/launchpage-logo.png" alt="L4UNCH P4GE" ref={logo} />
      <div className="tour-stage">
        <div className="tour-slide" key={i}>
          {/* V20-327 (Dan, Nov 18): each slide's picture is a small copy of the real Launch Page card (first-time
              dashboard, canvas D1), so the tour looks like what you'll use. */}
          {i === 0 && (
            <div className="tp">
              <div className="tp-head">
                <span className="tp-sub">Timed launches</span>
                <span className="tp-tab is-on">Active 1</span>
                <span className="tp-tab">Tomorrow 0</span>
                <span className="tp-tab">Complete 0</span>
                <span className="tp-plus">+</span>
              </div>
              <div className="tp-launch is-next">
                <span className="tp-time">9:00 AM</span>
                <div className="tp-main">
                  <b>WORK BLOCK - Deep work</b>
                  <span>Today · 90 min · opens 3 links · NEXT</span>
                </div>
                <span className="tp-q is-key">▶</span>
                <span className="tp-q">✓</span>
                <span className="tp-q">✕</span>
              </div>
            </div>
          )}
          {i === 1 && (
            <div className="tp">
              <div className="tp-head">
                <span className="tp-title">Rockets</span>
                <span className="tp-plus is-key">
                  <RocketIcon size={14} />
                </span>
                <span className="tp-plus">+</span>
              </div>
              <div className="tp-tiles">
                <div className="tp-tile">
                  <span className="tp-badge">D</span>
                  <div>
                    <b>DEEP WORK</b>
                    <span>3 links</span>
                  </div>
                </div>
                <div className="tp-tile">
                  <span className="tp-badge is-purple">A</span>
                  <div>
                    <b>ADMIN</b>
                    <span>4 links</span>
                  </div>
                </div>
                <div className="tp-tile is-new">+ New rocket</div>
              </div>
            </div>
          )}
          {/* Nov 18 (CP-008): the routine rolls from now: NOW on top, the rest of the day below, then tomorrow. */}
          {i === 2 && (
            <div className="tp tp-narrow">
              <div className="tp-head">
                <span className="tp-title">Workday</span>
              </div>
              <div className="tp-rt is-now">
                <span className="tp-time">9:00 AM</span>
                <b>Deep work</b>
                <span className="tp-tag is-key">Now</span>
              </div>
              <div className="tp-rt">
                <span className="tp-time">11:30 AM</span>
                <span>Admin &amp; email</span>
              </div>
              <div className="tp-rt">
                <span className="tp-time">2:00 PM</span>
                <span>Client work</span>
              </div>
              <div className="tp-rt">
                <span className="tp-time">11:00 PM</span>
                <span>Bed</span>
              </div>
              <div className="tp-rt is-next-day">
                <span className="tp-time">7:00 AM</span>
                <span>Wake up</span>
                <span className="tp-tag">Tomorrow</span>
              </div>
            </div>
          )}
          {i === 3 && (
            <div className="tp">
              <div className="tp-head">
                <span className="tp-title">Tasks</span>
                <span className="tp-plus">+</span>
              </div>
              {[
                // Nov 18 (Dan): one task due today on top, then his real key tasks (THREE) on later dates.
                ['Today', 'PAY', 'Rent', 'Due'],
                ['Fri', 'FIND', 'New shop', 'Three'],
                ['Mon', 'BETA WK 2', 'Launch Page', 'Three'],
                ['Wed', 'CREATE', 'System optimization strategy', 'Three']
              ].map(([d, t, x, st]) => (
                <div key={x} className="tp-task">
                  <span className="tp-date">{d}</span>
                  <span className="tp-main">
                    <b>{t}</b> · {x}
                  </span>
                  <span className={`tp-pill is-${st.toLowerCase()}`}>{st}</span>
                  <span className="tp-q">✓</span>
                  <span className="tp-q is-more">···</span>
                </div>
              ))}
            </div>
          )}
          {i === 4 && (
            <div className="tp">
              <div className="tp-head">
                <span className="tp-sub">Timed launches</span>
                <span className="tp-tab">Active 0</span>
                <span className="tp-tab is-on">Complete 2</span>
              </div>
              <div className="tp-launch">
                <span className="tp-time">9:00 AM</span>
                <div className="tp-main">
                  <b>WORK BLOCK - Deep work</b>
                  <span>Today · 85 min spent</span>
                </div>
                <span className="tp-q">✎</span>
              </div>
              <div className="tp-launch">
                <span className="tp-time">11:30 AM</span>
                <div className="tp-main">
                  <b>ADMIN - Admin &amp; email</b>
                  <span>Today · 45 min spent</span>
                </div>
                <span className="tp-q">✎</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="tour-copy" ref={copy}>
        {/* V20-404 (Dan, Nov 19): phones break the first headline after WHAT'S. */}
        <h2>
          {SLIDES[i].title.includes("WHAT'S ") ? (
            <>
              {SLIDES[i].title.split("WHAT'S ")[0]}WHAT'S <br className="phone-br" />
              {SLIDES[i].title.split("WHAT'S ")[1]}
            </>
          ) : (
            SLIDES[i].title
          )}
        </h2>
        <p>{SLIDES[i].body}</p>
      </div>
      <div className="welcome-dots tour-dots" role="tablist" aria-label="Tour slides">
        <button type="button" aria-label="Slide 1: Welcome" onClick={onWelcome} />
        {SLIDES.map((s, n) => (
          <button key={n} type="button" aria-label={`Slide ${n + 2}: ${s.title}`} className={n === i ? 'is-on' : ''} onClick={() => setI(n)} />
        ))}
      </div>
      <div className="tour-actions">
        <button type="button" className="welcome-btn" onClick={() => (i === 0 ? onWelcome() : setI(i - 1))}>
          Back
        </button>
        {last ? (
          <button type="button" className="welcome-btn welcome-key welcome-start" onClick={onSignUp}>
            Start <RocketIcon size={16} />
          </button>
        ) : (
          <button type="button" className="welcome-btn welcome-key" onClick={() => setI(i + 1)}>
            Next
          </button>
        )}
      </div>
      <button type="button" className="welcome-link tour-skip" onClick={onSignUp}>
        Skip the tour
      </button>
    </main>
  );
}
