import { createContext, useContext } from 'react';

/** V20-245 (Dan, Nov 14): one search in the header, on every page. Each page reads what's typed and filters itself. */
export const HeaderSearchContext = createContext<{ q: string; setQ: (v: string) => void }>({ q: '', setQ: () => {} });
export const useHeaderSearch = () => useContext(HeaderSearchContext);
/** True when the text matches the search (case-insensitive); an empty search matches everything. */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return fields.some((f) => (f ?? '').toLowerCase().includes(n));
}
