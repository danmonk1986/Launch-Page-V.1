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

export const BetaContext = createContext(false);
/** True in beta mode (testers always; the admin when the switch says Beta). */
export const useBeta = () => useContext(BetaContext);

const KEY = 'lp.mode';
export const readLpMode = (): 'main' | 'beta' => {
  try {
    return localStorage.getItem(KEY) === 'beta' ? 'beta' : 'main';
  } catch {
    return 'main';
  }
};
export const writeLpMode = (m: 'main' | 'beta') => {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* no storage */
  }
};
