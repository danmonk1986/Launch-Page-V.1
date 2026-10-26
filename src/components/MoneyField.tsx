import { useState } from 'react';
import { CURRENCIES, HOME, rateToCad, toCad } from '../lib/currency';
import { AmountInput } from './AmountInput';

export type Money = { amount: number | null; foreign: number | null; currency: string };

const CALC = 'M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 7.5h7M9 11h.01M12 11h.01M15 11h.01M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01';

/**
 * Amount with a currency (Oct 25). Type 80, pick AUD, tap the calculator: it becomes the CAD
 * amount at today's rate, with "from 80 AUD" under it. Tap again to see the 80 AUD.
 * The CAD amount is what counts in totals.
 */
export function MoneyField({ value, onChange, label = 'Amount' }: { value: Money; onChange: (m: Money) => void; label?: string }) {
  const foreignCur = value.currency && value.currency !== HOME;
  // Showing the original price (80 AUD) or the CAD it converts to.
  const [showCad, setShowCad] = useState(() => !foreignCur || value.amount !== null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editingForeign = foreignCur && !showCad;

  const convert = async () => {
    if (!foreignCur) return;
    if (showCad) return setShowCad(false);
    if (value.foreign === null) return setErr('Type the amount first.');
    setBusy(true);
    setErr('');
    try {
      const rate = await rateToCad(value.currency);
      onChange({ ...value, amount: toCad(value.foreign, rate) });
      setShowCad(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No rate right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field money-field">
      <span>
        {label} ({editingForeign ? value.currency : '$ CAD'})
      </span>
      <div className="money-row">
        <AmountInput
          label={label}
          value={editingForeign ? value.foreign : value.amount}
          onChange={(n) =>
            // A new original price needs converting again, so the CAD clears until it is.
            editingForeign ? onChange({ ...value, foreign: n, amount: null }) : onChange({ ...value, amount: n })
          }
        />
        <select
          aria-label="Currency"
          value={value.currency || HOME}
          onChange={(e) => {
            const c = e.target.value;
            setErr('');
            if (c === HOME) {
              onChange({ amount: value.amount ?? value.foreign, foreign: null, currency: HOME });
              setShowCad(true);
            } else {
              // The number in the box becomes the price in the new currency.
              const shown = editingForeign ? value.foreign : value.amount;
              onChange({ amount: null, foreign: shown, currency: c });
              setShowCad(false);
            }
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {foreignCur && (
          <button
            type="button"
            className="icon-btn tool-btn money-calc"
            aria-pressed={showCad}
            disabled={busy}
            aria-label={showCad ? `Show the ${value.currency} price` : `Convert to CAD at today's rate`}
            title={showCad ? `Show the ${value.currency} price` : `Convert to CAD at today's rate`}
            onClick={() => void convert()}
          >
            <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={CALC} />
            </svg>
          </button>
        )}
      </div>
      {foreignCur && (
        <p className="field-hint money-hint">
          {busy
            ? 'Getting today’s rate…'
            : err
              ? err
              : showCad
                ? `From ${value.foreign ?? '?'} ${value.currency}. Tap the calculator to see it.`
                : value.amount !== null
                  ? `= $${value.amount.toFixed(2)} CAD`
                  : 'Tap the calculator to convert to CAD (or it converts when you save).'}
        </p>
      )}
    </div>
  );
}

/** Before saving: a price in another currency that hasn't been converted yet gets today's rate. */
export async function settleMoney(m: Money): Promise<Money> {
  if (!m.currency || m.currency === HOME || m.foreign === null || m.amount !== null) return m;
  const rate = await rateToCad(m.currency);
  return { ...m, amount: toCad(m.foreign, rate) };
}
