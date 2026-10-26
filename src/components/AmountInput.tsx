import { useEffect, useState } from 'react';
import { evalAmount } from '../lib/formula';

/**
 * A money box (Oct 26) that keeps what you type ("1." on the way to 1.20) and takes a formula like
 * a sheet: "=12*8" shows "= 96" as you type and becomes 96 when you leave the box or press Enter.
 */
export function AmountInput({
  value,
  onChange,
  placeholder,
  label,
  className
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const isFormula = text.trim().startsWith('=');
  const preview = isFormula ? evalAmount(text) : null;

  // A value set from outside (a conversion, Use last) shows; what we're typing stays as typed.
  useEffect(() => {
    if (isFormula) return;
    if (evalAmount(text) !== value && !(text.trim() === '' && value === null)) setText(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    if (!isFormula) return;
    const r = evalAmount(text);
    if (r === null) return;
    setText(String(r));
    onChange(r);
  };

  return (
    <span className={`amount-input${className ? ` ${className}` : ''}`}>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        title="A number, or a formula like =12*8"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (!v.trim().startsWith('=')) onChange(evalAmount(v));
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isFormula) {
            e.preventDefault();
            commit();
          }
        }}
      />
      {isFormula && (
        <span className={`amount-preview${preview === null ? ' is-bad' : ''}`} aria-live="polite">
          {preview === null ? 'can’t work that out yet' : `= ${preview}`}
        </span>
      )}
    </span>
  );
}
