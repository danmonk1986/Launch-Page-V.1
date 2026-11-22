import { createContext, useContext } from 'react';
import { DEFAULT_MODULES, type Modules } from './settings';

/**
 * V20-362 (Dan, Nov 19): BETA MODE. One lean version of the app for every tester: Routine · Rockets + Timed launches
 * (with Stats) · This Week · Tasks · all of Appearance. Everything else is hidden (nothing deleted): Budget, Records,
 * Invoices, Planner, KNOWLEDGE!B4SE, 26 Days, Personal Alchemy, Projects (tab + pickers), Google Calendar.
 * Testers are always in beta mode; the admin (Dan) flips Main · Beta in ⚙ › Beta Testers.
 */
export const BETA_MODULES: Modules = {
  ...DEFAULT_MODULES,
  rockets: true, routine: true, tasks: true, week: true,
  journal: false, days26: false, goals: false, milestones: false, budget: false, trips: false,
  invoice: false, records: false, crm: false, marketing: false, planner: false, projects: false, kb: false
};

/**
 * V20-453 (Dan, Nov 22): BETA TRACKS. The Books track (Dan's dad, a test harness for the books features): a Books
 * home with Budget, Expenses and Income, branded BOOKS. No rockets, routine, tasks, calendar, draws or invoices.
 */
export const BOOKS_MODULES: Modules = {
  ...DEFAULT_MODULES,
  rockets: false, routine: false, tasks: false, week: false,
  journal: false, days26: false, goals: false, milestones: false, budget: true, trips: false,
  invoice: false, records: true, recExpenses: true, recIncome: true, recDraws: false,
  crm: false, marketing: false, planner: false, projects: false, kb: false
};
export type BetaTrack = 'launch' | 'books';
/** The track on the account (set only by the invite function; anything else is Launch). */
export const trackOf = (meta: Record<string, unknown> | undefined | null): BetaTrack => (meta?.beta_track === 'books' ? 'books' : 'launch');
/** True on the Books track (a tester whose account is set to Books). */
export const BooksContext = createContext(false);
export const useBooks = () => useContext(BooksContext);
/** /books in the address: the invite and sign-in pages wear BOOKS before anyone has signed in. */
export const booksPath = () => typeof window !== 'undefined' && /^\/books(\/|$)/.test(window.location.pathname);
export const BOOKS_LOGO = '/books-logo.png';

export const BetaContext = createContext(false);
/** True in beta mode (testers always; the admin when the switch says Beta). */
export const useBeta = () => useContext(BetaContext);

const KEY = 'lp.mode';
export type LpMode = 'main' | 'beta';
export const readLpMode = (): LpMode => {
  try {
    return localStorage.getItem(KEY) === 'beta' ? 'beta' : 'main';
  } catch {
    return 'main';
  }
};
export const writeLpMode = (m: LpMode) => {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* no storage */
  }
};
