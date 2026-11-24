import { useEffect, useState } from 'react';

/**
 * V20-506 (Dan, Nov 24, Books): Undo for an instant bad decision. App keeps the history (a copy of the books before
 * each change, last 20, until the page reloads); pages only read the count and press Undo. Changes made outside App
 * (the Expenses audit's tick, the Budget audit's bin) announce themselves with `rememberBooks(label)` first.
 */
type State = { count: number; label: string; at: number };
let state: State = { count: 0, label: '', at: 0 };
let handler: (() => void) | null = null;
const subs = new Set<(s: State) => void>();

export function setUndoState(s: Partial<State>) {
  state = { ...state, ...s };
  for (const f of subs) f(state);
}
export function setUndoHandler(fn: (() => void) | null) {
  handler = fn;
}
export const undoBooks = () => handler?.();

export function useBooksUndo() {
  const [s, set] = useState(state);
  useEffect(() => {
    subs.add(set);
    return () => void subs.delete(set);
  }, []);
  return { ...s, undo: undoBooks };
}

export const REMEMBER_EVENT = 'books:remember';
export const UNDONE_EVENT = 'books:undone';
/** Before a change App doesn't make itself: App takes its copy now. */
export const rememberBooks = (label: string) => window.dispatchEvent(new CustomEvent(REMEMBER_EVENT, { detail: label }));
/** localStorage lists Undo puts back (pages re-read them on UNDONE_EVENT). */
export const UNDO_KEYS = ['launchpage.statementKept.v1', 'launchpage.budgetAuditSkip.v1'];
