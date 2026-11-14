import { useMemo, useState } from 'react';
import { isoDate, type Launch, type LaunchLog } from '../lib/rockets';
import type { Project } from '../lib/projects';
import { DAY1, DAY27, RANGES, SOURCE_LABEL, doneRates, fmtH, groupBy, hourRuns, rangeFrom, type Bar, type StatsRange } from '../lib/stats';

type Props = {
  launches: Launch[];
  log: LaunchLog[];
  projects: Project[];
  today: Date;
  offDays: string[];
  /** Past routine days: on = baseline (at most one non-negotiable missed). Off days left out. */
  baseline: { day: string; on: boolean }[];
};

/**
 * V20-185 (Dan, Nov 14): Stats like the CEO dashboard (MVP sample week): a range toggle, stat cards, where
 * the hours went, then whether the hours can be trusted. Rules live in lib/stats.ts.
 */
export function StatsPanel({ launches, log, projects, today, offDays, baseline }: Props) {
  const [range, setRange] = useState<StatsRange>(() => {
    try {
      return (localStorage.getItem('launchpage.stats.range.v1') as StatsRange) || 'week';
    } catch {
      return 'week';
    }
  });
  const pick = (r: StatsRange) => {
    setRange(r);
    try {
      localStorage.setItem('launchpage.stats.range.v1', r);
    } catch {
      /* per device only */
    }
  };
  const to = isoDate(today);
  const from = rangeFrom(range, today);
  const s = useMemo(() => {
    const runs = hourRuns(log, projects, from, to);
    const work = runs.filter((r) => r.productive);
    const personal = runs.filter((r) => !r.productive);
    const sum = (rs: { minutes: number }[]) => rs.reduce((t, r) => t + r.minutes, 0);
    const rates = doneRates(launches, log, today, from, new Set(offDays));
    const done = rates.reduce((t, r) => t + r.done, 0);
    const total = rates.reduce((t, r) => t + r.total, 0);
    const timed = runs.filter((r) => r.timeSource === 'timed');
    const saved = timed.map((r) => ({ r, saved: r.planned + r.extra - (r.loggedMin ?? 0) }));
    const base = baseline.filter((b) => b.day >= from && b.day <= to);
    // Hours per routine day, stacked by project.
    const days = [...new Set(runs.map((r) => r.routineDay ?? r.day))].sort();
    const perDay = days.map((d) => ({ day: d, bars: groupBy(runs.filter((r) => (r.routineDay ?? r.day) === d), (r) => r.projectName, undefined, (r) => r.color) }));
    const sources = groupBy(runs, (r) => r.timeSource ?? 'none');
    return {
      runs, work, personal,
      workMin: sum(work), personalMin: sum(personal),
      rates, done, total,
      // V20-186 (Dan, Nov 14): finishing late doesn't count against time saved; only early finishes add up.
      savedMin: saved.reduce((t, x) => t + Math.max(0, x.saved), 0), overRuns: saved.filter((x) => x.saved < 0).length, saved: saved.sort((a, b) => b.saved - a.saved),
      baseOn: base.filter((b) => b.on).length, baseDays: base.length,
      perDay, sources,
      byProject: groupBy(runs, (r) => r.projectName, undefined, (r) => r.color),
      byWhat: groupBy(work, (r) => r.what),
      byKind: groupBy(runs, (r) => (r.productive ? 'Productivity' : 'Personal time')),
      bySlot: groupBy(timed.filter((r) => r.productive && r.startHour !== null), (r) => `${String(r.startHour).padStart(2, '0')}:00`),
      long: runs.filter((r) => r.long),
      overlap: runs.filter((r) => r.overlapMin > 0)
    };
  }, [log, projects, launches, offDays, baseline, from, to, today]);

  const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const card = (label: string, value: string, sub: string, hero = false) => (
    <div className={`pd-card${hero ? ' st-hero' : ''}`}>
      <span className="pd-label">{label}</span>
      <span className="pd-num">{value}</span>
      <span className="pd-sub">{sub}</span>
    </div>
  );
  const bars = (title: string, note: string, list: Bar[], color = 'var(--accent-teal)') => {
    const max = Math.max(1, ...list.map((b) => b.minutes));
    return (
      <div className="st-card">
        <h4 className="st-h">{title}</h4>
        <p className="st-note">{note}</p>
        {list.length === 0 ? (
          <p className="st-note">Nothing logged in this range yet.</p>
        ) : (
          <ul className="st-bars">
            {list.map((b) => (
              <li key={b.key}>
                <span className="st-bar-name">{b.label}</span>
                <span className="st-track" aria-hidden="true">
                  <span style={{ width: `${(b.minutes / max) * 100}%`, background: b.color ?? color }} />
                </span>
                <span className="st-val">
                  {fmtH(b.minutes)} h <span>· {b.runs}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
  const dayMax = Math.max(1, ...s.perDay.map((d) => d.bars.reduce((t, b) => t + b.minutes, 0)));
  const hoursFrom = from < DAY27 ? DAY27 : from;

  return (
    <div className="stats">
      <div className="st-range" role="tablist" aria-label="Range">
        {RANGES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={range === id} className={`st-range-btn${range === id ? ' is-on' : ''}`} onClick={() => pick(id)}>
            {label}
          </button>
        ))}
        <span className="st-range-note">
          {fmtDay(from)} – {fmtDay(to)}
        </span>
      </div>

      <div className="pd-cards">
        {card('Hours worked', fmtH(s.workMin), `${s.work.length} runs · from ${fmtDay(hoursFrom)}`, true)}
        {card('Launches done', s.total ? `${Math.round((s.done / s.total) * 100)}%` : '—', `${s.done} of ${s.total} (cleared left out)`)}
        {card('Time saved', `${Math.round(s.savedMin)} min`, `finished early · ${s.saved.length} timed runs${s.overRuns ? ` · ${s.overRuns} ran over` : ''}`, true)}
        {card('Baseline days', s.baseDays ? `${Math.round((s.baseOn / s.baseDays) * 100)}%` : '—', `${s.baseOn} of ${s.baseDays} days`)}
        {card('Personal time', fmtH(s.personalMin), `${s.personal.length} runs · Log Productivity off`)}
      </div>

      <h3 className="timed-title settings-section st-sec">Where the hours went</h3>
      <div className="st-card st-wide">
        <h4 className="st-h">Hours per routine day, by project</h4>
        <p className="st-note">Each bar is one routine day; colours are the projects' colours.</p>
        {s.perDay.length === 0 ? (
          <p className="st-note">Nothing logged in this range yet.</p>
        ) : (
          <div className="st-days">
            {s.perDay.map((d) => {
              const tot = d.bars.reduce((t, b) => t + b.minutes, 0);
              return (
                <div key={d.day} className="st-day" title={`${fmtDay(d.day)}: ${fmtH(tot)} h`}>
                  <span className="st-day-val">{fmtH(tot)}</span>
                  <span className="st-stack" style={{ height: `${(tot / dayMax) * 100}%` }}>
                    {d.bars.map((b) => (
                      <span key={b.key} style={{ flexGrow: b.minutes, background: b.color }} title={`${b.label}: ${fmtH(b.minutes)} h`} />
                    ))}
                  </span>
                  <span className="st-day-lab">{fmtDay(d.day).split(',')[0]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="st-grid">
        {bars('By project', 'Hours and runs per project.', s.byProject)}
        {bars('By What', 'Productivity hours per launch category.', s.byWhat, 'var(--accent-purple)')}
        {bars('Productivity vs personal', "From each project's Log Productivity switch.", s.byKind, 'var(--accent-purple)')}
        {bars('Best start hour', 'Timed productivity hours by the hour they started.', s.bySlot, '#98EE92')}
      </div>

      <h3 className="timed-title settings-section st-sec">Can the hours be trusted</h3>
      <div className="st-grid">
        <div className="st-card">
          <h4 className="st-h">How the time was logged</h4>
          <p className="st-note">Every done run that counts hours, by where its minutes came from.</p>
          <table className="st-table">
            <thead>
              <tr><th>Source</th><th>What it means</th><th className="r">Runs</th><th className="r">Hours</th></tr>
            </thead>
            <tbody>
              {s.sources.map((b) => (
                <tr key={b.key}><td>{b.key}</td><td>{SOURCE_LABEL[b.key] ?? ''}</td><td className="r">{b.runs}</td><td className="r">{fmtH(b.minutes)}</td></tr>
              ))}
            </tbody>
          </table>
          {s.overlap.length > 0 && (
            <p className="st-note">
              Overlap: {s.overlap.length} run{s.overlap.length === 1 ? '' : 's'} gave up {s.overlap.reduce((t, r) => t + r.overlapMin, 0)} min to a run started inside {s.overlap.length === 1 ? 'it' : 'them'}.
            </p>
          )}
        </div>
        <div className="st-card">
          <h4 className="st-h">Done rate per launch · the 60% gate</h4>
          <p className="st-note">Skipped and missed count as not done; cleared counts neither way. From {fmtDay(from < DAY1 ? DAY1 : from)}.</p>
          <div className="timed-rates">
            <ul>
              {s.rates.map((r) => (
                <li key={r.name} className={`timed-rate${r.pct < 60 ? ' is-low' : ''}`}>
                  <span className="timed-rate-name">{r.name}</span>
                  <span className="timed-rate-bar" aria-hidden="true"><span style={{ width: `${r.pct}%` }} /></span>
                  <span className="timed-rate-pct">{r.pct}%</span>
                  <span className="timed-rate-meta">{r.done} done · {r.skipped} skipped · {r.missed} missed</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {s.long.length > 0 && (
          <div className="st-card st-wide st-flag">
            <h4 className="st-h">Flagged · runs over 4 h</h4>
            <p className="st-note">Probably left running. Check them in Complete.</p>
            <table className="st-table">
              <tbody>
                {s.long.map((r) => (
                  <tr key={r.id}><td>{fmtDay(r.routineDay ?? r.day)}</td><td>{r.title}</td><td className="r">{fmtH(r.loggedMin ?? 0)} h</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="st-card st-wide">
          <h4 className="st-h">Time saved, run by run</h4>
          <p className="st-note">Timed runs only. + = finished early and counts as saved; running over is shown but never counts against you.</p>
          {s.saved.length === 0 ? (
            <p className="st-note">No timed runs in this range yet.</p>
          ) : (
            <div className="st-scroll">
              <table className="st-table">
                <thead>
                  <tr><th>Day</th><th>Launch</th><th className="r">Allotted</th><th className="r">Spent</th><th className="r">Saved</th></tr>
                </thead>
                <tbody>
                  {s.saved.slice(0, 30).map(({ r, saved }) => (
                    <tr key={r.id}>
                      <td>{fmtDay(r.routineDay ?? r.day)}</td>
                      <td>{r.title}</td>
                      <td className="r">{r.planned + r.extra}</td>
                      <td className="r">{r.loggedMin}</td>
                      <td className={`r ${saved > 0 ? 'st-pos' : 'st-dim'}`}>{saved > 0 ? `+${saved}` : saved < 0 ? `${-saved} over` : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <details className="st-defs">
        <summary>Definitions</summary>
        <dl>
          <dt>Hours worked</dt><dd>Minutes on done runs from Day 27 (Nov 13), by routine day, on projects with Log Productivity on (or no project).</dd>
          <dt>Personal time</dt><dd>The same, on projects with Log Productivity off.</dd>
          <dt>Overlap</dt><dd>A run started while another was running keeps its minutes; the one it started inside gives them up. The day counts the time once.</dd>
          <dt>Launches done</dt><dd>Done out of done + skipped + missed, from Oct 16. Cleared counts neither way.</dd>
          <dt>Time saved</dt><dd>Allotted (planned + added) minus spent, on timed runs that finished early. Running over counts as 0.</dd>
          <dt>Baseline day</dt><dd>At most one non-negotiable unticked. Off days left out.</dd>
        </dl>
      </details>
    </div>
  );
}
