import { useId } from 'react';
import { MONTHS, nth, REPEAT_KINDS, startRepeat, type Repeat, type RepeatKind } from '../lib/repeat';

const ORD = ['1ST', '2ND', '3RD', '4TH', 'LAST'];
const ORD_LABEL: Record<string, string> = { '1ST': '1st', '2ND': '2nd', '3RD': '3rd', '4TH': '4th', LAST: 'Last' };
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEEKDAY_LABEL: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Repeat for Tasks and Budget: None / Weekly (days) / Monthly / Quarterly (date or weekday) / Annually (date). */
export function RepeatPicker({ value, onChange, from }: { value: Repeat; onChange: (r: Repeat) => void; /** Starts a new repeat from this date. */ from?: string | null }) {
  const id = useId();
  const set = (patch: Partial<Repeat>) => onChange({ ...value, ...patch });
  const r = value.rule.trim().toUpperCase();
  const wk = r.match(/^(1ST|2ND|3RD|4TH|LAST)\s+([A-Z]{3})/);
  const mode: 'day' | 'weekday' = wk ? 'weekday' : 'day';
  const dayNum = /^\d{1,2}$/.test(r) ? Number(r) : 1;
  // LP-030: "Last day" (M:LAST) lands on Oct 31, Nov 30, Feb 28.
  const dayVal = r === 'LAST' ? 'LAST' : String(dayNum);
  const ord = wk ? wk[1] : '1ST';
  const dow = wk ? wk[2] : 'MON';
  const [mo, dy] = value.date.split('-').map(Number);
  const putDate = (m: number, d: number) => set({ date: `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  return (
    <fieldset className="field">
      <legend>Repeat</legend>
      <select aria-label="Repeat" value={value.kind} onChange={(e) => onChange(startRepeat(e.target.value as RepeatKind, from))}>
        {REPEAT_KINDS.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label}
          </option>
        ))}
      </select>
      {value.kind === 'weekly' && (
        <div className="choice-row repeat-row" role="group" aria-label="Days of the week">
          {DAYS.map((d, i) => (
            <label key={i} className="choice" title={DAY_NAMES[i]}>
              <input type="checkbox" checked={value.days.includes(i)} onChange={() => set({ days: value.days.includes(i) ? value.days.filter((x) => x !== i) : [...value.days, i].sort() })} aria-label={DAY_NAMES[i]} />
              <span>{d}</span>
            </label>
          ))}
        </div>
      )}
      {(value.kind === 'monthly' || value.kind === 'quarterly') && (
        <>
          <div className="choice-row repeat-row">
            <label className="choice">
              <input type="radio" name={`${id}-mode`} checked={mode === 'day'} onChange={() => set({ rule: dayVal })} />
              <span>On a date</span>
            </label>
            <label className="choice">
              <input type="radio" name={`${id}-mode`} checked={mode === 'weekday'} onChange={() => set({ rule: `${ord} ${dow}` })} />
              <span>On a weekday</span>
            </label>
          </div>
          {mode === 'day' ? (
            <div className="time-grid repeat-row">
              <select aria-label="Day of the month" value={dayVal} onChange={(e) => set({ rule: e.target.value })}>
                <option value="LAST">the last day</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    the {nth(i + 1)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="time-grid repeat-row">
              <select aria-label="Which week" value={ord} onChange={(e) => set({ rule: `${e.target.value} ${dow}` })}>
                {ORD.map((o) => (
                  <option key={o} value={o}>
                    {ORD_LABEL[o]}
                  </option>
                ))}
              </select>
              <select aria-label="Weekday" value={dow} onChange={(e) => set({ rule: `${ord} ${e.target.value}` })}>
                {WEEKDAYS.map((w) => (
                  <option key={w} value={w}>
                    {WEEKDAY_LABEL[w]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {value.kind === 'quarterly' && (
            <label className="field repeat-row">
              <span>Starting in</span>
              <select aria-label="First month" value={value.startMonth} onChange={(e) => set({ startMonth: Number(e.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m} ({[0, 3, 6, 9].map((k) => MONTHS[(i + k) % 12]).join(' ')})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="field-hint">Days past the end of a short month land on its last day.</p>
        </>
      )}
      {value.kind === 'annual' && (
        <div className="time-grid repeat-row">
          <select aria-label="Month" value={mo || 1} onChange={(e) => putDate(Number(e.target.value), dy || 1)}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select aria-label="Day" value={dy || 1} onChange={(e) => putDate(mo || 1, Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}
