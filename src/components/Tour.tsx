import { useState } from 'react';

/**
 * V20-295 (Dan, Nov 17): the MVP tour, from the white setup canvas (board B). Welcome is slide 1; this is slides 2–6.
 * Each slide pairs a small picture of the real feature with a short headline. Dot 1 and BACK on the first slide go
 * back to Welcome; START LAUNCHING! and Skip go to sign up (the beta request). V20-296: logo colours; the dots sit
 * in the same place as on Welcome, with the text above them.
 */
const SLIDES = [
  { title: 'It comes to you.', body: 'At block time a timed launch pops up front and centre.\nStart it, snooze it to a real time, or skip it on purpose.' },
  { title: 'Everything opens at once.', body: 'A rocket is every link one block needs.\nOne tap on START opens them all.' },
  { title: 'The routine leads the day.', body: 'What is happening NOW sits on top, the rest of the day below.\nDays, nights or shift work: it flips with you.' },
  { title: 'Tasks that sort themselves.', body: 'Due today and your key tasks stay current,\nand the week shows what is coming.' },
  { title: 'Proof, not feelings.', body: 'Each block asks how long it really took. Log it all, or just the part that got done,\nand the week shows whether you are sticking to the plan.' }
];

export function Tour({ start = 0, onWelcome, onSignUp }: { start?: number; onWelcome: () => void; onSignUp: () => void }) {
  const [i, setI] = useState(Math.max(0, Math.min(SLIDES.length - 1, start)));
  const last = i === SLIDES.length - 1;
  return (
    <main className="tour">
      <img className="tour-logo" src="/launchpage-logo.png" alt="L4UNCH P4GE" />
      <div className="tour-stage">
        <div className="tour-slide" key={i}>
          {i === 0 && (
            <div className="tour-card">
              <p className="tour-label">Launch time</p>
              <p className="tour-big">
                <span className="tour-time">11:30 AM</span> Admin &amp; email
              </p>
              <p className="tour-mono">60 min · opens 4 tabs</p>
              <div className="tour-row-end">
                <span className="tour-pill">Snooze</span>
                <span className="tour-pill is-go">Start</span>
              </div>
            </div>
          )}
          {i === 1 && (
            <div className="tour-rockets">
              <div><b>Deep work</b><span>notion · figma · playlist</span></div>
              <div className="is-on"><b>Admin &amp; email</b><span>inbox · calendar · chat · invoices</span></div>
              <div><b>Client work</b><span>drive · figma · tracker</span></div>
              <div className="is-new">+ New rocket</div>
            </div>
          )}
          {i === 2 && (
            <div className="tour-day">
              <div className="tour-now"><span className="tour-time">9:00 AM</span><span className="tour-now-tag">NOW</span><b>Deep work</b></div>
              {[['11:30 AM', 'Admin & email'], ['12:30 PM', 'Lunch & walk'], ['2:00 PM', 'Client work'], ['10:00 PM', 'Bed']].map(([t, n]) => (
                <p key={t}><span>{t}</span>{n}</p>
              ))}
            </div>
          )}
          {i === 3 && (
            <div className="tour-tasks">
              <p className="tour-head">Due today · 2</p>
              <p className="tour-task"><span className="tour-box" /><span>Send homepage revisions</span><span className="tour-when">Today</span></p>
              <p className="tour-task is-late"><span className="tour-box" /><span>Pay hosting invoice</span><span className="tour-when">Yesterday</span></p>
              <p className="tour-head">This week</p>
              <div className="tour-week">
                {[['MON', 'Deep work'], ['TUE', 'Client call'], ['WED', 'Deep work'], ['THU', 'Proposal'], ['FRI', 'Q4 plan']].map(([d, n], k) => (
                  <span key={d} className={k === 1 ? 'is-on' : ''}>{d}<br /><b>{n}</b></span>
                ))}
              </div>
            </div>
          )}
          {i === 4 && (
            <div className="tour-card is-log">
              <p className="tour-label">Log the time?</p>
              <p className="tour-log"><b>45 min</b><span>from 11:45 AM</span></p>
              <p className="tour-check"><span className="tour-box is-done" />Admin &amp; email</p>
              <p className="tour-check"><span className="tour-box" />Reply to Nova</p>
              <div className="tour-bars"><span style={{ height: '80%' }} /><span style={{ height: '60%' }} /><span className="is-purple" style={{ height: '95%' }} /><span className="is-grey" style={{ height: '20%' }} /><span className="is-grey" style={{ height: '20%' }} /></div>
            </div>
          )}
        </div>
      </div>
      <div className="tour-copy">
        <h2>{SLIDES[i].title}</h2>
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
          <button type="button" className="welcome-btn welcome-key" onClick={onSignUp}>
            Start launching!
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
