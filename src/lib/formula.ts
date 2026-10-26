/**
 * Money box formulas (Oct 26): "=12*8" → 96, like a sheet. Plain arithmetic only: + - * / and
 * brackets, with decimals. "$1,200" and "1200" read as numbers. Anything else returns null.
 */
export function evalAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  const isFormula = s.startsWith('=');
  if (isFormula) s = s.slice(1);
  s = s.replace(/[$,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  if (!isFormula) {
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : null;
  }
  let i = 0;
  const peek = () => s[i];
  const number = (): number => {
    const m = s.slice(i).match(/^\d*\.?\d+|^\d+\./);
    if (!m) throw new Error('number');
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number => {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error(')');
      i++;
      return v;
    }
    return number();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}
