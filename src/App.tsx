import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, LIGHT_BACKGROUNDS, loadSettings, saveSettings, type BrandSettings } from './lib/settings';
import { downloadExport } from './lib/exportData';
import { Header, type PageId } from './components/Header';
import { HeaderClock } from './components/Clock';
import { ComingSoon, LaunchPageHome } from './components/Dashboard';
import { BudgetPage } from './components/Budget';
import { budgetStore, type BudgetLine } from './lib/budget';
import { expenseFromLine, expenseStore, type Expense } from './lib/expenses';
import { RoutinePicker } from './components/RoutinePicker';
import { RoutineEditor } from './components/RoutineEditor';
import { clearLegacyNonNegs, readLegacyNonNegs } from './lib/nonneg';
import { syncNonNegs } from './lib/nnsync';
import { meditationStore, MeditationsContext, type Meditation } from './lib/meditations';
import { hiddenPickStore, HiddenPicksContext, pickKey as hiddenKey, type HiddenPick } from './lib/hiddenPicks';
import { customerStore, invoiceStore, profileStore, type Customer, type Invoice, type InvoiceProfile } from './lib/invoices';
import { InvoicesPage } from './components/Invoices';
import { nextRepeat, readRepeat, writeRepeat } from './lib/repeat';
import { Days26Page } from './components/Days26';
import {
  DEFAULT_CONFIG,
  activeNonNegs,
  configStore,
  dayId,
  dayStore,
  effShift,
  flipsNow,
  resetMinutes,
  logStore,
  modeOf,
  nonNegForRitual,
  nonNegStore,
  ritualKey,
  pickKey,
  quoteStore,
  routineDay,
  snapshot,
  type Config,
  type DayRecord,
  type LogEntry,
  type NonNeg,
  type Quote
} from './lib/days26';
import { readScrollMode, writeScrollMode, type ScrollMode } from './lib/view';
import { TodayPanel, useNow } from './components/TodayPanel';
import { BLOCKED_HELP, LaunchersPanel, nameFromUrl, rocketOptions, type TimedPreset } from './components/Launchers';
import { LaunchReminder, MissedLaunches, TimeUpReminder } from './components/LaunchReminder';
import { chime, unlockAudioOnFirstGesture } from './lib/alerts';
import { WeekCalendar } from './components/WeekCalendar';
import { TasksPage, TasksPanel } from './components/Tasks';
import { ProjectsSheet } from './components/Projects';
import { matchCalendar, projectStore, type Project } from './lib/projects';
import { buildJournalImport, byNewest, checkinsOf, journalStore, newEntry, withCheckins, type JournalEntry } from './lib/journal';
import { JournalPanel } from './components/Journal';
import { Sheet } from './components/Sheet';
import { RitualRunner } from './components/Rituals';
import { buildImport, newTask, repeatOf, taskStore, trashExpired, type ImportRow, type Task } from './lib/tasks';
import { addTaskToGoogle, googleConfigured, knownCalendars, wasConnected } from './lib/google';
import {
  isDue,
  isMissed,
  isoDate,
  launchStore,
  launcherStore,
  markHandled,
  openTabs,
  readHandled,
  skipToTomorrow,
  launchersFor,
  splitShared,
  dedupeRoutines,
  type Launch,
  type LaunchLog,
  launchLogStore,
  runKey,
  setLaunchDayReset,
  setCardOpener,
  opensSomething,
  describeLog,
  logFor,
  timeFor,
  type Launcher
} from './lib/launchers';
import { eventStore, type CalEvent } from './lib/events';
import type { Store } from './lib/store';
import {
  deleteRoutine,
  loadActive,
  loadRoutines,
  routineLabel,
  routinesOnly,
  saveActive,
  shiftMinutes,
  saveRoutine,
  type Routine,
  type Shift
} from './lib/routines';
import { SettingsPanel } from './components/SettingsPanel';
import { GearMenu } from './components/GearMenu';
import { MusicPlayer } from './components/MusicPlayer';
import { SignIn } from './components/SignIn';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState<false | 'brand' | 'colours'>(false);
  const [status, setStatus] = useState('');
  // A page in the address (#tasks, #budget…) opens there: card rockets from a timed launch use it.
  const [page, setPage] = useState<PageId>(() => {
    const h = window.location.hash.replace('#', '');
    return (['launch', 'tasks', 'days26', 'budget', 'invoices', 'journal'] as PageId[]).includes(h as PageId) ? (h as PageId) : 'launch';
  });
  useEffect(() => {
    // Keep the address on the page you're on, so a refresh stays there.
    const want = page === 'launch' ? '' : `#${page}`;
    if (window.location.hash !== want) history.replaceState(null, '', `${window.location.pathname}${want}`);
  }, [page]);
  // Phones fold the headline out of the fixed header once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift>('nights');
  const [routineProblem, setRoutineProblem] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; routine: Routine | null }>({ open: false, routine: null });
  const [launchers, setLaunchers] = useState<Launcher[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  // 26 Days
  const [nonnegs, setNonnegs] = useState<NonNeg[]>([]);
  const [d26Days, setD26Days] = useState<DayRecord[]>([]);
  const [d26Logs, setD26Logs] = useState<LogEntry[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [budget, setBudget] = useState<BudgetLine[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [d26Config, setD26Config] = useState<Config>(DEFAULT_CONFIG);
  const [d26Ready, setD26Ready] = useState(false);
  const [meditations, setMeditations] = useState<Meditation[]>([]);
  const [hiddenPicks, setHiddenPicks] = useState<HiddenPick[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceProfile, setInvoiceProfile] = useState<InvoiceProfile[]>([]);
  const [medReady, setMedReady] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  const [gcalOff, setGcalOff] = useState(0);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  const [scrollMode, setScrollMode] = useState<ScrollMode>(readScrollMode);
  // Card by card: the page snaps to each card; the header's height keeps cards clear of it.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('snap-scroll', scrollMode === 'cards');
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar) return;
    const ro = new ResizeObserver(() => root.style.setProperty('--header-h', `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, [scrollMode, authReady, session]);
  const importInput = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  // eslint-disable-next-line react-hooks/refs
  tasksRef.current = tasks;
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [calVersion, setCalVersion] = useState(0);
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Launch | null>(null);
  // Snoozes are kept in this browser (Oct 22, LP-026): a reload or coming back to the tab no
  // longer forgets them and brings the reminder straight back. Expired ones are dropped.
  const SNOOZE_KEY = 'launchpage.snoozed.v1';
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => {
    try {
      const all = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number>;
      return Object.fromEntries(Object.entries(all).filter(([, until]) => until > Date.now()));
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozed));
    } catch {
      /* ignore */
    }
  }, [snoozed]);
  const [handled, setHandled] = useState(() => readHandled());
  const [timeUp, setTimeUp] = useState<Launch | null>(null);
  // Each run of a timed launch (launched, +10s, done or skipped), kept for 26 Days.
  const [launchLog, setLaunchLog] = useState<LaunchLog[]>([]);
  const logRef = useRef<LaunchLog[]>([]);
  logRef.current = launchLog;
  function logLaunch(l: Launch, patch: (g: LaunchLog) => Partial<LaunchLog>) {
    const list = logRef.current;
    const cur = logFor(list, l, new Date());
    const item = { ...cur, ...patch(cur), title: l.title };
    const next = list.some((g) => g.id === item.id) ? list.map((g) => (g.id === item.id ? item : g)) : [...list, item];
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.save(userId, item, next);
  }
  const extraToday = (id: string) => launchLog.find((g) => g.launchId === id && g.day === isoDate(now))?.extra ?? 0;
  // Oct 25: pause a launched run (lunch, a call). Paused minutes push the end alarm back and don't
  // count as time spent. Kept in this browser per run: { at: paused since (ms) or null, min: paused so far }.
  const PAUSE_KEY = 'launchpage.paused.v1';
  const [paused, setPaused] = useState<Record<string, { at: number | null; min: number }>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PAUSE_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PAUSE_KEY, JSON.stringify(paused));
    } catch {
      /* ignore */
    }
  }, [paused]);
  const pausedMin = (l: Launch, at = Date.now()) => {
    const p = paused[runKey(l, new Date(at))];
    return p ? p.min + (p.at ? (at - p.at) / 60_000 : 0) : 0;
  };
  const isPaused = (l: Launch) => !!paused[runKey(l, new Date())]?.at;
  function togglePause(l: Launch) {
    const key = runKey(l, new Date());
    const cur = paused[key] ?? { at: null, min: 0 };
    const t = Date.now();
    const next = cur.at ? { at: null, min: cur.min + (t - cur.at) / 60_000 } : { ...cur, at: t };
    setPaused((m) => ({ ...m, [key]: next }));
    setStatus(next.at ? `${l.title}: paused. The clock stops until you resume.` : `${l.title}: resumed (${Math.round(next.min)} min paused).`);
  }
  const [endAlerted, setEndAlerted] = useState<Record<string, true>>({});

  useEffect(() => unlockAudioOnFirstGesture(), []);
  const now = useNow(30_000);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadSettings(userId).then(setSettings);
  }, [userId]);

  useEffect(() => {
    if (supabase && !session) return;
    let live = true;
    (async () => {
      const loaded = await loadRoutines(userId);
      let list = loaded.routines;
      const active = await loadActive(userId);
      if (!live) return;
      const [l1, l2, l3] = await Promise.all([launcherStore.load(userId), launchStore.load(userId), eventStore.load(userId)]);
      if (!live) return;
      let tiles = l1.items;
      // One tile set per routine: copy any shared tiles into each routine, then drop the shared ones.
      const split = splitShared(tiles, list.map((r) => r.id));
      if (split) {
        tiles = split.next;
        for (const c of split.copies) await launcherStore.save(userId, c, tiles);
        for (const sh of split.shared) await launcherStore.remove(userId, sh.id, tiles);
      }
      // Routines saved twice: keep one of each, moving any tiles it lacks onto it.
      const dupes = dedupeRoutines(list, tiles, active.id);
      if (dupes) {
        list = dupes.routines;
        tiles = dupes.launchers;
        for (const l of dupes.moved) await launcherStore.save(userId, l, tiles);
        for (const id of dupes.dropTiles) await launcherStore.remove(userId, id, tiles);
        for (const r of dupes.dropRoutines) await deleteRoutine(userId, r.id, list);
      }
      if (!live) return;
      setRoutines(list);
      setRoutineProblem(loaded.problem);
      setActiveId(list.some((r) => r.id === active.id) ? active.id : list[0]?.id ?? null);
      setShift(active.shift);
      setLaunchers(tiles);
      setLaunches(l2.items);
      setEvents(l3.items);
      const [p1, t1, j1, g1] = await Promise.all([projectStore.load(userId), taskStore.load(userId), journalStore.load(userId), launchLogStore.load(userId)]);
      if (!live) return;
      setLaunchLog(g1.items);
      setProjects(p1.items);
      setJournal(j1.items);
      // Recently deleted keeps tasks for 30 days, then they go for good.
      const expired = t1.items.filter((t) => trashExpired(t));
      const kept = t1.items.filter((t) => !trashExpired(t));
      setTasks(kept);
      for (const t of expired) await taskStore.remove(userId, t.id, kept);
      // 26 Days
      const [n1, dd, lg, q1, c1] = await Promise.all([nonNegStore.load(userId), dayStore.load(userId), logStore.load(userId), quoteStore.load(userId), configStore.load(userId)]);
      if (!live) return;
      let nn = n1.items;
      // Anything added with "Add non-negotiable" before 26 Days existed moves into the list once.
      const legacy = readLegacyNonNegs().filter((l) => !nn.some((n) => !n.archived && n.label.toLowerCase() === l.toLowerCase()));
      for (const label of legacy) {
        const item: NonNeg = { id: crypto.randomUUID(), label, section: 'morning', time: null, timeFrom: null, log: null, target: 0, perWeek: null, archived: false, sort: nn.length };
        nn = [...nn, item];
        await nonNegStore.save(userId, item, nn);
      }
      clearLegacyNonNegs();
      setNonnegs(nn);
      setD26Days(dd.items);
      setD26Logs(lg.items);
      setQuotes(q1.items);
      setD26Config(c1.items[0] ?? DEFAULT_CONFIG);
      setD26Ready(true);
      const b1 = await budgetStore.load(userId);
      if (!live) return;
      setBudget(b1.items);
      const ex = await expenseStore.load(userId);
      if (!live) return;
      setExpenses(ex.items);
      const md = await meditationStore.load(userId);
      if (!live) return;
      setMeditations(md.items);
      const hp = await hiddenPickStore.load(userId);
      if (!live) return;
      setHiddenPicks(hp.items);
      const [iv, cu, pf] = await Promise.all([invoiceStore.load(userId), customerStore.load(userId), profileStore.load(userId)]);
      if (!live) return;
      setInvoices(iv.items);
      setCustomers(cu.items);
      setInvoiceProfile(pf.items);
      setMedReady(true);
      setStoreProblem(l1.problem ?? l2.problem ?? l3.problem ?? p1.problem ?? t1.problem ?? j1.problem ?? n1.problem ?? dd.problem ?? lg.problem);
    })();
    return () => {
      live = false;
    };
  }, [userId, session]);

  // Rituals are kept for 26 Days but no longer picked or shown on the Launch Page.
  const shownRoutines = routinesOnly(routines);
  const activeRoutine = shownRoutines.find((r) => r.id === activeId) ?? shownRoutines[0] ?? null;
  // "+ Timed launch" from a routine step: opens Add timed launch on the Launch Page, filled in.
  const [timedPreset, setTimedPreset] = useState<TimedPreset | null>(null);
  const [editLaunch, setEditLaunch] = useState<Launch | null>(null);

  function pickRoutine(id: string, s: Shift) {
    setActiveId(id);
    setShift(s);
    saveActive(userId, id, s);
  }

  async function handleSaveRoutine(r: Routine) {
    const exists = routines.some((x) => x.id === r.id);
    const next = exists ? routines.map((x) => (x.id === r.id ? r : x)) : [...routines, r];
    setRoutines(next);
    const ok = await saveRoutine(userId, r, next);
    if (!exists) pickRoutine(r.id, shift);
    setStatus(ok ? `${r.name} saved.` : `${r.name} saved on this device only.`);
  }

  // One save/delete pair per list: update the screen first, then the cloud.
  function ops<T extends { id: string }>(store: Store<T>, list: T[], setList: (l: T[]) => void, name: (t: T) => string) {
    return {
      save: async (item: T) => {
        const next = list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
        setList(next);
        const ok = await store.save(userId, item, next);
        setStatus(ok ? `${name(item)} saved.` : `${name(item)} saved on this device only.`);
      },
      /** Several at once (a reorder), so no save works from a stale list. */
      saveMany: async (items: T[]) => {
        const byId = new Map(items.map((i) => [i.id, i]));
        const next = [...list.map((x) => byId.get(x.id) ?? x), ...items.filter((i) => !list.some((x) => x.id === i.id))];
        setList(next);
        let ok = true;
        for (const i of items) ok = (await store.save(userId, i, next)) && ok;
        setStatus(ok ? 'Saved.' : 'Saved on this device only.');
      },
      remove: async (id: string) => {
        const next = list.filter((x) => x.id !== id);
        setList(next);
        await store.remove(userId, id, next);
        setStatus('Deleted.');
      }
    };
  }
  const launcherOps = ops(launcherStore, launchers, setLaunchers, (l) => l.name);
  const launchOps = ops(launchStore, launches, setLaunches, (l) => l.title);
  // Oct 25: a launch saved with a new time drops its snooze, so it pops up at the new time
  // (Snooze → Edit snoozes 10 minutes, which hid an edit to 3 minutes from now).
  function saveLaunchEdit(l: Launch) {
    const old = launches.find((x) => x.id === l.id);
    const moved = !old || old.atTime !== l.atTime || old.onDate !== l.onDate || JSON.stringify(old.onceTime) !== JSON.stringify(l.onceTime) || old.repeat !== l.repeat;
    if (moved && snoozed[l.id]) {
      setSnoozed((m) => {
        const next = { ...m };
        delete next[l.id];
        return next;
      });
    }
    return launchOps.save(l);
  }
  const eventOps = ops(eventStore, events, setEvents, (e) => e.title);
  const projectOps = ops(projectStore, projects, setProjects, (p) => p.name);
  const taskOps = ops(taskStore, tasks, setTasks, (t) => t.task);
  const nonNegOps = ops(nonNegStore, nonnegs, setNonnegs, (n) => n.label);
  // Meditations save from the newest copy (several can change in one ritual save).
  const medsRef = useRef(meditations);
  medsRef.current = meditations;
  async function saveMeditation(m: Meditation) {
    const list = medsRef.current;
    const next = list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m];
    medsRef.current = next;
    setMeditations(next);
    const ok = await meditationStore.save(userId, m, next);
    if (!ok) setStatus(`${m.title || 'Meditation'} saved on this device only.`);
  }
  async function removeMeditation(id: string) {
    const next = medsRef.current.filter((x) => x.id !== id);
    medsRef.current = next;
    setMeditations(next);
    await meditationStore.remove(userId, id, next);
    setStatus('Meditation removed from the library.');
  }
  // Oct 24: the ✕ in a description dropdown hides that item from its list.
  const hiddenRef = useRef(hiddenPicks);
  hiddenRef.current = hiddenPicks;
  function hidePick(list: string, value: string) {
    const v = hiddenKey(value);
    if (!v || hiddenRef.current.some((h) => h.list === list && h.value === v)) return;
    const h: HiddenPick = { id: crypto.randomUUID(), list, value: v, sort: hiddenRef.current.length };
    const next = [...hiddenRef.current, h];
    hiddenRef.current = next;
    setHiddenPicks(next);
    void hiddenPickStore.save(userId, h, next).then((ok) => {
      if (!ok) setStatus('Removed on this device only. Run supabase/migrations/0030_hidden_picks.sql to sync it.');
    });
  }
  const quoteOps = ops(quoteStore, quotes, setQuotes, () => 'Quote');
  const budgetOps = ops(budgetStore, budget, setBudget, (l) => l.description);
  const invoiceOps = ops(invoiceStore, invoices, setInvoices, (i) => i.number || 'Invoice');
  const customerOps = ops(customerStore, customers, setCustomers, (c) => c.name);
  const profileOps = ops(profileStore, invoiceProfile, setInvoiceProfile, () => 'Your details');
  // Expenses (LP-030) save from the newest copy: a tick and an edit can land together.
  const expRef = useRef(expenses);
  expRef.current = expenses;
  async function saveExpense(e: Expense, quiet = false) {
    const list = expRef.current;
    const next = list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
    expRef.current = next;
    setExpenses(next);
    const ok = await expenseStore.save(userId, e, next);
    if (!ok) setStatus('Expense saved on this device only. Run supabase/migrations/0031_budget_links.sql to sync it.');
    else if (!quiet) setStatus(`${e.description || 'Expense'} saved.`);
  }
  async function removeExpense(id: string) {
    const next = expRef.current.filter((x) => x.id !== id);
    expRef.current = next;
    setExpenses(next);
    await expenseStore.remove(userId, id, next);
  }
  /** An edited expense. A fixed line (rent) follows what was actually paid. */
  async function editExpense(e: Expense) {
    await saveExpense(e);
    const line = e.budgetLineId ? budget.find((l) => l.id === e.budgetLineId) : undefined;
    if (line && line.section === 'fixed' && e.amount !== null && e.amount !== line.amount) {
      await budgetOps.save({ ...line, amount: e.amount });
      setStatus(`${line.description}: budget updated to the amount paid.`);
    }
  }
  /**
   * Tick to pay (LP-030): ticking a task linked to a budget line adds that line to Expenses,
   * dated the day it was ticked; unticking takes it back out.
   */
  async function payFor(items: Task[]) {
    for (const t of items) {
      if (!t.budgetLineId) continue;
      const old = tasks.find((x) => x.id === t.id);
      const newDay = t.doneAt ? isoDate(new Date(t.doneAt)) : null;
      const oldDay = old?.doneAt ? isoDate(new Date(old.doneAt)) : null;
      if (newDay && newDay !== oldDay) {
        const line = budget.find((l) => l.id === t.budgetLineId);
        if (!line || expRef.current.some((e) => e.taskId === t.id && e.date === newDay)) continue;
        await saveExpense(expenseFromLine(line, newDay, t.id, expRef.current.reduce((m, e) => Math.max(m, e.sort + 1), 0)), true);
        setStatus(`${line.description}: paid, added to Expenses.`);
      } else if (oldDay && !newDay) {
        for (const e of expRef.current.filter((x) => x.taskId === t.id && x.date === oldDay)) await removeExpense(e.id);
        setStatus(`${t.task}: taken back out of Expenses.`);
      }
    }
  }
  const saveTask = async (t: Task) => {
    await taskOps.save(t);
    await payFor([t]);
  };
  const saveTasks = async (items: Task[]) => {
    await taskOps.saveMany(items);
    await payFor(items);
  };
  /** An import: the budget becomes exactly this list. */
  async function replaceBudget(next: BudgetLine[]) {
    const old = budget;
    setBudget(next);
    for (const l of old) if (!next.some((n) => n.id === l.id)) await budgetStore.remove(userId, l.id, next);
    let ok = true;
    for (const l of next) ok = (await budgetStore.save(userId, l, next)) && ok;
    setStatus(ok ? `Budget: ${next.length} lines saved.` : `Budget: ${next.length} lines saved on this device only.`);
  }

  // 26 Days lists that change often (ticks, logs) save quietly from the newest copy.
  const daysRef = useRef(d26Days);
  daysRef.current = d26Days;
  function saveDay(d: DayRecord) {
    const list = daysRef.current;
    const next = list.some((x) => x.day === d.day) ? list.map((x) => (x.day === d.day ? d : x)) : [...list, d];
    daysRef.current = next;
    setD26Days(next);
    void dayStore.save(userId, d, next);
  }
  const logsRef = useRef(d26Logs);
  logsRef.current = d26Logs;
  async function saveLog(l: LogEntry) {
    const list = logsRef.current;
    const isNew = !list.some((x) => x.id === l.id);
    const next = isNew ? [...list, l] : list.map((x) => (x.id === l.id ? l : x));
    logsRef.current = next;
    setD26Logs(next);
    const ok = await logStore.save(userId, l, next);
    setStatus(`${isNew ? 'Logged' : 'Log updated'}${ok ? '.' : ' on this device only.'}`);
  }
  function deleteLog(id: string) {
    const next = logsRef.current.filter((x) => x.id !== id);
    logsRef.current = next;
    setD26Logs(next);
    void logStore.remove(userId, id, next);
    setStatus('Log deleted.');
  }
  async function saveD26Config(c: Config) {
    setD26Config(c);
    const ok = await configStore.save(userId, c, [c]);
    if (!ok) setStatus('Saved on this device only.');
  }
  /** Adds a Non-Negotiable to the 26 Days list (routine editor ⋯ → Add non-negotiable). */
  function addNonNeg(label: string) {
    const clean = label.trim();
    if (!clean || activeNonNegs(nonnegs).some((n) => n.label.toLowerCase() === clean.toLowerCase())) return;
    void nonNegOps.save({ id: crypto.randomUUID(), label: clean, section: 'morning', time: null, timeFrom: null, log: null, target: 0, perWeek: null, archived: false, sort: nonnegs.length });
  }
  // Non-Negotiables are every routine's baseline: on load and whenever the list changes,
  // add, link, rename or remove their steps in each routine (lib/nnsync.ts).
  const routinesRef = useRef(routines);
  routinesRef.current = routines;
  useEffect(() => {
    if (!d26Ready) return;
    const changed = syncNonNegs(routinesRef.current, nonnegs);
    if (changed.length === 0) return;
    const next = routinesRef.current.map((r) => changed.find((c) => c.id === r.id) ?? r);
    routinesRef.current = next;
    setRoutines(next);
    void (async () => {
      let ok = true;
      for (const r of changed) ok = (await saveRoutine(userId, r, next)) && ok;
      if (!ok) setStatus('Non-Negotiables synced to routines on this device only.');
    })();
  }, [d26Ready, nonnegs, userId]);
  // Once: meditation steps that kept their own script move into the library (Oct 20).
  const medMoved = useRef(false);
  useEffect(() => {
    if (!medReady || medMoved.current || routines.length === 0) return;
    medMoved.current = true;
    void (async () => {
      let lib = medsRef.current;
      const changedRituals: Routine[] = [];
      for (const r of routinesRef.current.filter((x) => x.kind === 'ritual')) {
        let changed = false;
        const items = r.items.map((s) => {
          if (s.type !== 'meditation' && !/medit/i.test(s.label)) return s;
          if (s.meditationId || !s.script?.trim()) return s;
          const same = lib.find((m) => m.script.trim() === s.script!.trim());
          const m = same ?? { id: crypto.randomUUID(), title: s.label.trim() || 'Meditation', script: s.script, sort: lib.length };
          if (!same) {
            lib = [...lib, m];
            void saveMeditation(m);
          }
          changed = true;
          return { ...s, meditationId: m.id };
        });
        if (changed) changedRituals.push({ ...r, items });
      }
      if (!changedRituals.length) return;
      const next = routinesRef.current.map((x) => changedRituals.find((c) => c.id === x.id) ?? x);
      routinesRef.current = next;
      setRoutines(next);
      for (const r of changedRituals) await saveRoutine(userId, r, next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medReady, routines.length]);
  async function saveRitual(r: Routine) {
    const exists = routines.some((x) => x.id === r.id);
    const next = exists ? routines.map((x) => (x.id === r.id ? r : x)) : [...routines, r];
    setRoutines(next);
    const ok = await saveRoutine(userId, r, next);
    setStatus(ok ? `${r.name} saved.` : `${r.name} saved on this device only.`);
  }

  // The Journal saves itself while you type, so it saves quietly and from the newest list.
  const journalRef = useRef(journal);
  journalRef.current = journal;
  function saveJournal(e: JournalEntry) {
    const list = journalRef.current;
    const next = list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
    journalRef.current = next;
    setJournal(next);
    void journalStore.save(userId, e, next);
  }
  /** Journal import (a LaunchPage journal file): days already written are skipped. */
  async function importJournal(f: File) {
    try {
      const add = buildJournalImport(JSON.parse(await f.text()), journalRef.current);
      if (!add.length) return setStatus('Nothing new to import: those days are already in your journal.');
      const next = [...journalRef.current, ...add];
      journalRef.current = next;
      setJournal(next);
      for (const j of add) await journalStore.save(userId, j, next);
      setStatus(`Imported ${add.length} journal ${add.length === 1 ? 'entry' : 'entries'}.`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  }
  function deleteJournal(id: string) {
    const next = journalRef.current.filter((x) => x.id !== id);
    journalRef.current = next;
    setJournal(next);
    void journalStore.remove(userId, id, next);
    setStatus('Journal entry deleted.');
  }

  // 26 Days: today's record remembers the mode it's lived in and the list as it is today.
  const d26Mode = modeOf(activeRoutine);
  const d26Shift = effShift(d26Mode, shift);
  const d26Today = routineDay(now, activeRoutine, shift, flipsNow(d26Mode, shift));
  // Card rockets open one of LaunchPage's pages.
  setCardOpener((pg) => {
    setPage(pg as PageId);
    window.scrollTo({ top: 0 });
  });
  // Timed launches roll over with the routine day (its reset), the same as 26 Days.
  setLaunchDayReset(resetMinutes(activeRoutine, shift, flipsNow(d26Mode, shift)));
  useEffect(() => {
    if (!d26Ready || !activeRoutine) return;
    const items = snapshot(nonnegs);
    if (!items.length) return;
    const cur = daysRef.current.find((d) => d.day === d26Today);
    if (cur && cur.mode === d26Mode && cur.shift === d26Shift && JSON.stringify(cur.items) === JSON.stringify(items)) return;
    saveDay(cur ? { ...cur, mode: d26Mode, shift: d26Shift, items } : { id: dayId(d26Today), day: d26Today, mode: d26Mode, shift: d26Shift, ticks: [], items, sort: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d26Ready, d26Today, d26Mode, d26Shift, nonnegs, activeRoutine?.id]);

  // The daily goal is today's journal theme (it carries over from the last entry until changed).
  // The journal runs on the routine day too: it resets at bed time, not midnight.
  const journalDay = d26Today;
  const lastTheme = byNewest(journal).find((e) => e.date < journalDay && e.theme.trim())?.theme ?? '';
  const dailyGoal = journal.find((e) => e.date === journalDay)?.theme.trim() || lastTheme;
  function setDailyGoal(g: string) {
    const cur = journalRef.current.find((e) => e.date === journalDay) ?? newEntry(journalDay, '');
    saveJournal({ ...cur, theme: g });
    setStatus('Daily goal saved. It’s today’s journal theme too.');
  }

  /**
   * A timed launch checked off ticks the Non-Negotiable with the same name, as rituals do:
   * either name can contain the other ("Work Block #1 - Launch Page Construction" ticks "Work Block #1").
   * Logged Non-Negotiables tick from their logs, so only the tick kind is touched here.
   */
  function tickNonNegsFor(title: string): string[] {
    const t = title.trim().toLowerCase();
    if (t.length < 3) return [];
    const hits = activeNonNegs(nonnegs).filter((n) => {
      const label = n.label.trim().toLowerCase();
      return !n.log && label.length >= 3 && (t.includes(label) || label.includes(t));
    });
    for (const n of hits) tickToday(n.id, true);
    return hits.map((n) => n.label);
  }

  /** Ticks (or unticks) something for today: a Non-Negotiable or a ritual step. */
  function tickToday(key: string, on?: boolean) {
    const cur = daysRef.current.find((d) => d.day === d26Today) ?? { id: dayId(d26Today), day: d26Today, mode: d26Mode, shift: d26Shift, ticks: [], items: snapshot(nonnegs), sort: 0 };
    const has = cur.ticks.includes(key);
    const want = on ?? !has;
    if (want === has) return;
    saveDay({ ...cur, ticks: want ? [...cur.ticks, key] : cur.ticks.filter((x) => x !== key) });
  }
  const isTickedToday = (key: string) => !!d26Days.find((d) => d.day === d26Today)?.ticks.includes(key);

  /** A ritual's check-in step writes today's journal check-in #n (the Journal shows the same text). */
  const checkinText = (n: number) => {
    const e = journal.find((x) => x.date === journalDay);
    return e ? checkinsOf(e)[n - 1]?.text ?? '' : '';
  };
  function setCheckin(n: number, text: string) {
    const cur = journalRef.current.find((e) => e.date === journalDay) ?? newEntry(journalDay, lastTheme);
    const list = [...checkinsOf(cur)];
    while (list.length < n) list.push({ at: new Date().toISOString(), text: '' });
    list[n - 1] = { at: list[n - 1].at ?? new Date().toISOString(), text };
    saveJournal(withCheckins(cur, list));
  }

  // A timed launch with a ritual opens it here, over any page.
  const [ritualPop, setRitualPop] = useState<{ ritualId: string; launch: Launch | null } | null>(null);
  const popRitual = ritualPop ? routines.find((r) => r.id === ritualPop.ritualId) ?? null : null;

  // Link areas to Google calendars with the same name, once, the first time Google's list is seen.
  useEffect(() => {
    if (!projects.length) return;
    const cals = knownCalendars();
    const taken = new Set(projects.map((p) => p.calendarId).filter(Boolean));
    const linked: Project[] = [];
    for (const c of cals) {
      if (taken.has(c.id)) continue;
      const p = matchCalendar(projects, c.summary ?? '');
      if (p && !p.calendarId && !linked.some((x) => x.id === p.id)) {
        linked.push({ ...p, calendarId: c.id });
        taken.add(c.id);
      }
    }
    if (linked.length) projectOps.saveMany(linked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calVersion, projects.length]);

  async function importTasks(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { tasks?: ImportRow[] };
      if (!Array.isArray(data.tasks)) return setStatus('That file has no tasks in it.');
      const { tasks: add, created, skipped } = buildImport(data.tasks, tasks, projects);
      if (created.length) await projectOps.saveMany(created);
      if (add.length) await taskOps.saveMany(add);
      setStatus(`Imported ${add.length} tasks${created.length ? `, ${created.length} new projects` : ''}${skipped ? ` (${skipped} already here)` : ''}.`);
    } catch {
      setStatus('Could not read that file.');
    }
  }

  /** ⋯ → Add to calendar: the task goes on its project's Google calendar (all day, or an hour at its time). */
  async function addTaskToCalendar(t: Task) {
    if (!googleConfigured()) return setStatus('Google Calendar isn’t set up for this app yet.');
    const proj = projects.find((x) => x.id === t.projectId);
    const parent = proj?.parentId ? projects.find((x) => x.id === proj.parentId) : null;
    const calendarId = proj?.calendarId ?? parent?.calendarId ?? 'primary';
    const date = t.endDate ?? t.startDate ?? isoDate(new Date());
    try {
      const id = await addTaskToGoogle({
        calendarId,
        title: t.task,
        date,
        time: t.atTime,
        details: [t.description, t.link].filter(Boolean).join('\n')
      });
      await taskOps.save({ ...t, googleEventId: id });
      const cal = knownCalendars().find((c) => c.id === calendarId)?.summary ?? 'your calendar';
      setStatus(`${t.task} added to ${cal} on ${new Date(`${date}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`);
    } catch (err) {
      setStatus((err as Error).message || 'Could not add it to Google Calendar.');
    }
  }

  /** Budget ⋯ → Add to calendar: an all-day event on the line's date, in its project's calendar. */
  async function budgetToCalendar(l: BudgetLine, projectId: string | null) {
    if (!googleConfigured()) return setStatus('Google Calendar isn’t set up for this app yet.');
    const proj = projects.find((x) => x.id === projectId);
    const parent = proj?.parentId ? projects.find((x) => x.id === proj.parentId) : null;
    const calendarId = proj?.calendarId ?? parent?.calendarId ?? 'primary';
    const date = l.date ?? isoDate(new Date());
    try {
      await addTaskToGoogle({ calendarId, title: l.description, date, time: null, details: [l.amount === null ? '' : `$${l.amount}`, l.notes].filter(Boolean).join('\n') });
      const cal = knownCalendars().find((c) => c.id === calendarId)?.summary ?? 'your calendar';
      setStatus(`${l.description} added to ${cal}.`);
    } catch (err) {
      setStatus((err as Error).message || 'Could not add it to Google Calendar.');
    }
  }

  /** ⋯ → Create launch: a timed launch from the task, opening its link at its time. */
  /** Create launch from a task: opens Add timed launch filled in, so it can be checked before saving. */
  function createLaunchFromTask(t: Task) {
    // Repeats carry over: weekly days, a monthly date; anything else launches once on its next date.
    const rep = repeatOf(t);
    const monthly = rep.kind === 'monthly' && /^\d{1,2}$/.test(rep.rule);
    const weekly = rep.kind === 'weekly' && rep.days.length > 0;
    // No time: 9:30 AM, the first work block. No date: today if 9:30 hasn't passed, else tomorrow.
    const now = new Date();
    const firstBlock = now.getHours() * 60 + now.getMinutes() < 9 * 60 + 30 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    setPage('launch');
    setTimedPreset({
      fill: {
        title: t.task,
        atTime: t.atTime ?? '09:30',
        repeat: monthly ? 'monthly' : weekly ? 'weekly' : 'once',
        weekdays: weekly ? rep.days : [],
        monthDay: monthly ? Number(rep.rule) : null,
        onDate: monthly || weekly ? null : (rep.kind !== 'none' ? nextRepeat(rep, new Date()) : null) ?? t.endDate ?? t.startDate ?? isoDate(firstBlock),
        urls: t.link ? [t.link] : []
      },
      n: Date.now(),
      onSaved: (l) => {
        // Read the newest copy of the task: it may have changed while the form was open.
        const list = tasksRef.current;
        const cur = list.find((x) => x.id === t.id) ?? t;
        const item = { ...cur, launchId: l.id };
        const next = list.map((x) => (x.id === item.id ? item : x));
        tasksRef.current = next;
        setTasks(next);
        void taskStore.save(userId, item, next);
      }
    });
  }

  async function deleteProject(p: Project) {
    // Anything nested under it moves up a level rather than disappearing.
    const kids = projects.filter((x) => x.parentId === p.id).map((x) => ({ ...x, parentId: p.parentId }));
    if (kids.length) await projectOps.saveMany(kids);
    await projectOps.remove(p.id);
  }

  // Missed launches (Oct 21): coming back to the app, everything whose time passed today without
  // a check-off shows in ONE pop-up (with anything due right now), not one reminder after another.
  // Close keeps them in Active and the pop-up doesn't come back for those runs (kept per device).
  const MISSED_KEY = 'launchpage.missed.closed.v1';
  const [missedClosed, setMissedClosed] = useState<Record<string, true>>(() => {
    try {
      return JSON.parse(localStorage.getItem(MISSED_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const stillOpen = (l: Launch) => !handled[runKey(l, now)] && !missedClosed[runKey(l, now)];
  const missedNow = launches.filter((l) => isMissed(l, now) && stillOpen(l));
  const missedList = missedNow.length
    ? [...missedNow, ...launches.filter((l) => isDue(l, now) && stillOpen(l) && !(snoozed[l.id] && snoozed[l.id] > now.getTime()))].sort((a, b) =>
        timeFor(a, now).localeCompare(timeFor(b, now))
      )
    : [];
  function closeMissed() {
    const next = { ...missedClosed };
    for (const l of missedList) next[runKey(l, now)] = true;
    setMissedClosed(next);
    try {
      localStorage.setItem(MISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Timed launches: pop the reminder when one is due and not handled today.
  useEffect(() => {
    if (reminder || missedList.length) return;
    const due = launches.find(
      (l) => isDue(l, now) && !handled[runKey(l, now)] && !(snoozed[l.id] && snoozed[l.id] > now.getTime())
    );
    if (due) setReminder(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, reminder, snoozed, handled, missedList.length]);

  // Start alert: chime + desktop notification when a reminder pops.
  useEffect(() => {
    if (!reminder) return;
    if (reminder.sound !== false) chime('start', reminder.tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder?.id]);

  // End alarm: a launched launch whose time allotted has run out.
  useEffect(() => {
    if (timeUp || reminder) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const over = launches.find((l) => {
      const key = runKey(l, now);
      if (handled[key] !== 'launched' || endAlerted[key] || paused[key]?.at) return false;
      const [h, m] = timeFor(l, now).split(':').map(Number);
      const end = h * 60 + m + l.minutes + extraToday(l.id) + Math.round(pausedMin(l, now.getTime()));
      return nowMin >= end;
    });
    if (!over) return;
    setEndAlerted((m) => ({ ...m, [runKey(over, now)]: true }));
    setTimeUp(over);
    if (over.sound !== false) chime('end', over.tone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, handled, endAlerted, launchLog, timeUp, reminder, paused]);

  async function finishLaunch(l: Launch, how: 'done' | 'skipped') {
    setHandled(markHandled(l, new Date(), how));
    logLaunch(l, () => ({ outcome: how, finishedAt: new Date().toISOString() }));
    if (reminder?.id === l.id) setReminder(null);
    if (how === 'skipped') {
      if (l.repeat === 'hourly') return setStatus(`${l.title}: skipped this hour.`);
      // Skip today = same time tomorrow.
      await launchOps.save(skipToTomorrow(l, new Date()));
      setStatus(`${l.title} moved to tomorrow, same time.`);
    } else {
      const ticked = tickNonNegsFor(l.title);
      const logged = await logFromLaunch(l);
      if (ticked.length && !logged) return setStatus(`${l.title} checked off: ${ticked.join(', ')} ticked.`);
      setStatus(logged ? `${l.title} checked off: ${logged} logged.` : `${l.title} checked off.`);
    }
  }

  /**
   * What a timed launch logs when checked off Done (26 Days). Set on the launch under "Logs":
   * Activity / Break use the time allotted, H2O / Food / Vice their fixed amount, Productivity
   * the time from Launch to Done (or the time allotted if there was nothing to open). Unset:
   * launches that open tabs or apps log Productivity by time spent; the rest log nothing.
   * Returns a short description of what was logged, or '' if nothing.
   */
  async function logFromLaunch(l: Launch): Promise<string> {
    const kind = l.logKind ?? (l.urls.length && !l.ritualId ? 'productivity' : null);
    if (!kind) return '';
    // Hourly launches log once an hour, so each gets its own line; others update today's line.
    const run = logFor(logRef.current, l, new Date());
    const id = l.repeat === 'hourly' ? crypto.randomUUID() : run.id;
    const base = { id, day: d26Today, at: new Date().toISOString(), note: l.title, mode: d26Mode, sort: 0, qty: 1 };
    if (kind === 'productivity') {
      const allowed = (run.planned || l.minutes) + run.extra;
      const spent = run.launchedAt && opensSomething(l) ? (Date.now() - new Date(run.launchedAt).getTime()) / 60_000 - pausedMin(l) : allowed;
      const blocks = Math.round((Math.min(spent, allowed) / 90) * 4) / 4;
      if (blocks <= 0) return '';
      await saveLog({ ...base, kind, amount: 1, qty: blocks, unit: 'blocks' });
      return `${blocks} block${blocks === 1 ? '' : 's'} of Productivity`;
    }
    const entry: LogEntry =
      kind === 'activity'
        ? { ...base, kind, amount: l.minutes, unit: 'min' }
        : kind === 'rest'
          ? { ...base, kind, amount: l.minutes, unit: 'min' }
          : kind === 'h2o'
            ? { ...base, kind, amount: l.logAmount ?? 500, unit: 'ml', note: '' }
            : kind === 'food'
              ? { ...base, kind, amount: l.logAmount ?? 0, unit: 'kcal' }
              : { ...base, kind, amount: l.logAmount ?? 1, unit: 'load' };
    if (!(entry.amount > 0)) return '';
    await saveLog(entry);
    return describeLog(l).replace(' · ', ' ');
  }

  function launchNow(l: Launch) {
    const ritual = l.ritualId ? routines.find((r) => r.id === l.ritualId && r.kind === 'ritual') : null;
    if (ritual) setRitualPop({ ritualId: ritual.id, launch: l });
    const blocked = l.urls.length ? openTabs(l.urls) : false;
    // Opening the tabs is not finishing: it stays open until checked off.
    setHandled(markHandled(l, new Date(), 'launched'));
    logLaunch(l, (g) => ({ outcome: 'launched', launchedAt: g.launchedAt ?? new Date().toISOString(), planned: l.minutes }));
    setReminder(null);
    setStatus(blocked ? BLOCKED_HELP : `Launched ${l.title}.`);
  }

  async function handleDeleteRoutine(id: string) {
    const gone = routines.find((x) => x.id === id);
    const next = routines.filter((x) => x.id !== id);
    setRoutines(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    await deleteRoutine(userId, id, next);
    setStatus(gone ? `${gone.name} deleted.` : 'Deleted.');
  }

  async function handleSave(next: BrandSettings) {
    setSettings(next);
    const { synced } = await saveSettings(userId, next);
    setStatus(synced ? 'Settings saved and synced.' : 'Settings saved on this device.');
  }

  // On the light Damascus theme the neons are deepened a little so they read on white.
  const light = LIGHT_BACKGROUNDS.includes(settings.background);
  const ink = (c: string, pct: number) => (light ? `color-mix(in srgb, ${c} ${pct}%, #2b2a2a)` : c);
  const theme = {
    // Night mode (dark backgrounds) and day mode (light backgrounds) each have their own four colours.
    '--accent-purple': light ? ink(settings.dayPurple, 92) : settings.accentPurple,
    '--accent-teal': light ? ink(settings.dayTeal, 72) : settings.accentTeal,
    '--accent-green': light ? ink(settings.dayGreen, 80) : settings.accentGreen,
    '--accent-pink': light ? ink(settings.dayPink, 88) : settings.accentPink
  } as CSSProperties;

  // Your own background image for this mode, if you've picked one.
  const bgImage = light ? settings.dayBgImage : settings.nightBgImage;
  if (bgImage) (theme as Record<string, string>)['--bg-image'] = `url("${bgImage}")`;
  if (!authReady) return <div className="app" style={theme} data-bg={settings.background} data-tone={light ? 'light' : 'dark'} />;
  if (supabase && !session) {
    return (
      <div className="app app-light" style={theme}>
        <SignIn />
      </div>
    );
  }

  return (
    <MeditationsContext.Provider value={{ list: meditations, save: saveMeditation, remove: removeMeditation }}>
    <HiddenPicksContext.Provider value={{ hidden: hiddenPicks, hide: hidePick }}>
    <div className={`${scrolled ? 'app is-scrolled' : 'app'}${bgImage ? ' has-bg-image' : ''}`} style={theme} data-bg={settings.background} data-tone={light ? 'light' : 'dark'} data-scroll={scrollMode}>
      <div className="sky" aria-hidden="true">
        <div className="sky-lines" />
        <div className="sky-horizon" />
        <div className="sky-floor" />
        <div className="sky-damascus" />
        <div className="sky-snow" />
      </div>
      <Header
        settings={settings}
        page={page}
        onPage={(pg) => {
          setFocusTask(null);
          setPage(pg);
        }}
        right={
          <>
            <div className="topbar-controls">
            <input
              ref={importInput}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPage('tasks');
                  importTasks(f);
                }
                e.target.value = '';
              }}
            />
            <MusicPlayer />
            <GearMenu
              items={[
                { label: 'Brand settings', onClick: () => setSettingsOpen('brand') },
                { label: 'Colour settings', onClick: () => setSettingsOpen('colours') },
                { label: 'Import tasks', onClick: () => importInput.current?.click() },
                { label: 'Export my data', onClick: () => downloadExport(settings) },
                ...(googleConfigured() && wasConnected()
                  ? [
                      {
                        label: 'Disconnect Google Calendar',
                        onClick: () => {
                          setPage('launch');
                          setGcalOff((n) => n + 1);
                        }
                      }
                    ]
                  : []),
                ...(supabase && session
                  ? [
                      {
                        label: 'Change password',
                        onClick: () => {
                          setSettingsOpen('brand');
                          setTimeout(() => document.querySelector<HTMLInputElement>('.account input[type=password]')?.focus(), 150);
                        }
                      },
                      { label: 'Sign out', danger: true, onClick: () => void supabase?.auth.signOut({ scope: 'local' }) }
                    ]
                  : [])
              ]}
            />
            <RoutinePicker
              routines={shownRoutines}
              activeId={activeRoutine?.id ?? null}
              shift={shift}
              onPick={pickRoutine}
              onAdd={() => setEditor({ open: true, routine: null })}
              onEdit={() => setEditor({ open: true, routine: activeRoutine })}
            />
            </div>
            <HeaderClock />
          </>
        }
      />
      <div className="frame">
        {(routineProblem || storeProblem) && (
          <p className="notice" role="status">
            {routineProblem ?? storeProblem}
          </p>
        )}
        <main aria-label={page === 'launch' ? 'Launch Page' : 'Page'}>
          {page === 'launch' ? (
            <LaunchPageHome
              launchers={
                <LaunchersPanel
                  rituals={routines.filter((r) => r.kind === 'ritual').map((r) => ({ id: r.id, name: r.name }))}
                  routineName={activeRoutine ? routineLabel(activeRoutine, shift) : null}
                  launchers={launchersFor(launchers, activeRoutine?.id ?? null)}
                  routineId={activeRoutine?.id ?? null}
                  launches={launches}
                  onSaveLauncher={launcherOps.save}
                  onSaveLaunchers={launcherOps.saveMany}
                  onDeleteLauncher={launcherOps.remove}
                  onSaveLaunch={saveLaunchEdit}
                  onDeleteLaunch={launchOps.remove}
                  onStatus={setStatus}
                  handled={handled}
                  today={now}
                  onFinish={finishLaunch}
                  onLaunchNow={launchNow}
                  isPaused={isPaused}
                  onPause={togglePause}
                  log={launchLog}
                  preset={timedPreset}
                  onPresetUsed={() => setTimedPreset(null)}
                  editLaunch={editLaunch}
                  onEditOpened={() => setEditLaunch(null)}
                />
              }
              week={
                <WeekCalendar
                  userId={userId}
                  disconnectTick={gcalOff}
                  onDisconnected={() => setGcalOff(0)}
                  events={events}
                  projects={projects}
                  onCalendars={() => setCalVersion((v) => v + 1)}
                  onSave={eventOps.save}
                  onDelete={eventOps.remove}
                  onStatus={setStatus}
                  taskFor={(e) => {
                    const live = tasks.filter((t) => !t.deletedAt);
                    // The event made from the task, or (older ones) a task of the same name on that day.
                    const byId = e.google ? live.find((t) => t.googleEventId === e.google!.id) : undefined;
                    const name = e.title.trim().toLowerCase();
                    const byName = live.find((t) => t.task.trim().toLowerCase() === name && (!t.endDate || (t.endDate >= e.startDate && t.endDate <= e.endDate) || t.startDate === e.startDate));
                    return (byId ?? byName)?.id ?? null;
                  }}
                  onOpenTask={(id) => {
                    setFocusTask(id);
                    setPage('tasks');
                  }}
                />
              }
              tasks={
                <TasksPanel
                  tasks={tasks}
                  projects={projects}
                  today={now}
                  onSave={saveTask}
                  onDelete={taskOps.remove}
                  onSaveMany={saveTasks}
                  onAddToCalendar={addTaskToCalendar}
                  onCreateLaunch={createLaunchFromTask}
                  onOpenAll={() => {
                    setFocusTask(null);
                    setPage('tasks');
                  }}
                  onOpenTask={(t) => {
                    setFocusTask(t.id);
                    setPage('tasks');
                  }}
                />
              }
              journal={<JournalPanel entries={journal} today={now} day={journalDay} onSave={saveJournal} onDelete={deleteJournal} onImport={importJournal} onOpen={() => setPage('journal')} />}
              today={
                <TodayPanel
                  follow={scrollMode === 'cards'}
                  routine={activeRoutine}
                  shift={shift}
                  onEdit={() => setEditor({ open: true, routine: activeRoutine })}
                />
              }
            />
          ) : page === 'tasks' ? (
            <TasksPage
              tasks={tasks}
              projects={projects}
              today={now}
              onSave={saveTask}
              onDelete={taskOps.remove}
                  onSaveMany={saveTasks}
                  onAddToCalendar={addTaskToCalendar}
                  onCreateLaunch={createLaunchFromTask}
              onOpenProjects={() => setProjectsOpen(true)}
              onClose={() => setPage('launch')}
              focusId={focusTask}
            />
          ) : page === 'journal' ? (
            <JournalPanel entries={journal} today={now} day={journalDay} onSave={saveJournal} onDelete={deleteJournal} onImport={importJournal} full onClose={() => setPage('launch')} />
          ) : page === 'days26' ? (
            <Days26Page
              now={now}
              displayName={settings.displayName}
              routine={activeRoutine}
              shift={shift}
              nonnegs={nonnegs}
              records={d26Days}
              logs={d26Logs}
              quotes={quotes}
              config={d26Config}
              rituals={routines.filter((r) => r.kind === 'ritual').sort((a, b) => a.sort - b.sort)}
              goal={dailyGoal}
              onGoal={setDailyGoal}
              onSaveNonNegs={nonNegOps.saveMany}
              onSaveDay={saveDay}
              onSaveLog={saveLog}
              onDeleteLog={deleteLog}
              onSaveQuote={quoteOps.save}
              onDeleteQuote={quoteOps.remove}
              onSaveConfig={saveD26Config}
              onSaveRitual={saveRitual}
              onDeleteRitual={handleDeleteRoutine}
              rockets={rocketOptions(launchers)}
              onAddRocket={async (url) => {
                await launcherOps.save({ id: crypto.randomUUID(), name: nameFromUrl(url), note: '', url, color: 'teal', routineIds: activeRoutine ? [activeRoutine.id] : null, sort: launchers.length });
              }}
              onTick={tickToday}
              checkinText={checkinText}
              onCheckin={setCheckin}
            />
          ) : page === 'invoices' ? (
            <InvoicesPage
              invoices={invoices}
              customers={customers}
              profile={invoiceProfile[0] ?? null}
              onSave={invoiceOps.save}
              onDelete={invoiceOps.remove}
              onSaveCustomer={customerOps.save}
              onDeleteCustomer={customerOps.remove}
              onSaveProfile={profileOps.save}
              onClose={() => setPage('launch')}
            />
          ) : page === 'budget' ? (
            <BudgetPage
              lines={budget}
              projects={projects}
              onSave={budgetOps.save}
              onDelete={budgetOps.remove}
              onReplace={replaceBudget}
              expenses={expenses}
              onSaveExpense={editExpense}
              onDeleteExpense={removeExpense}
              onClose={() => setPage('launch')}
              onToCalendar={budgetToCalendar}
              onToLaunch={(l) => {
                const now = new Date();
                const firstBlock = now.getHours() * 60 + now.getMinutes() < 9 * 60 + 30 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
                setPage('launch');
                // A repeating line keeps its rhythm: weekly days, a monthly date; else once on its next date.
                const rep = readRepeat(l.repeat);
                const monthly = rep.kind === 'monthly' && /^\d{1,2}$/.test(rep.rule);
                const weekly = rep.kind === 'weekly' && rep.days.length > 0;
                setTimedPreset({
                  fill: {
                    title: l.description,
                    atTime: '09:30',
                    repeat: monthly ? 'monthly' : weekly ? 'weekly' : 'once',
                    weekdays: weekly ? rep.days : [],
                    monthDay: monthly ? Number(rep.rule) : null,
                    onDate: monthly || weekly ? null : (rep.kind !== 'none' ? nextRepeat(rep, new Date()) : null) ?? l.date ?? isoDate(firstBlock),
                    urls: []
                  },
                  n: Date.now()
                });
              }}
              onToTask={async (l, projectId) => {
                // The line's repeat comes along, so a monthly bill is a monthly task.
                const rep = readRepeat(l.repeat);
                const t: Task = { ...newTask(tasks.length, projectId), task: l.description || 'Budget item', description: l.category || l.pmtCategory || '', endDate: rep.kind === 'none' ? l.date : null, repeatRule: writeRepeat(rep), expense: l.amount === null ? '' : String(l.amount), notes: l.notes };
                await taskOps.save(t);
                setFocusTask(t.id);
                setPage('tasks');
                setStatus(`${t.task} added to Tasks.`);
              }}
            />
          ) : (
            <ComingSoon page={page} />
          )}
          <ProjectsSheet
            open={projectsOpen}
            onClose={() => setProjectsOpen(false)}
            projects={projects}
            calendars={knownCalendars()}
            onSave={projectOps.save}
            onDelete={deleteProject}
          />
        </main>
        <footer className="toolbar">
          <img className="toolbar-logo" src="/launchpage-logo.png" alt="LaunchPage" />
          <p className="toolbar-status" role="status">
            {status || (supabase ? `Signed in as ${session?.user.email}` : 'Running on this device only. Add Supabase keys to sync.')}
          </p>
        </footer>
      </div>
      <Sheet open={!!popRitual} title={popRitual?.name ?? 'Ritual'} wide onClose={() => setRitualPop(null)}>
        {popRitual && (
          <RitualRunner
            ritual={popRitual}
            isTicked={(i) => isTickedToday(ritualKey(popRitual.id, i))}
            onTick={(i, on) => tickToday(ritualKey(popRitual.id, i), on)}
            isPicked={(i, o) => isTickedToday(pickKey(popRitual.id, i, o))}
            onPick={(i, o, on) => {
              tickToday(pickKey(popRitual.id, i, o), on);
              if (on) tickToday(ritualKey(popRitual.id, i), true);
            }}
            onSaveRitual={(r) => void saveRitual(r)}
            checkinText={checkinText}
            onCheckin={setCheckin}
            linked={nonNegForRitual(nonnegs, popRitual)}
            linkedDone={(() => {
              const n = nonNegForRitual(nonnegs, popRitual);
              return !!n && isTickedToday(n.id);
            })()}
            onDone={() => {
              const n = nonNegForRitual(nonnegs, popRitual);
              if (n) tickToday(n.id, true);
              const l = ritualPop?.launch;
              setRitualPop(null);
              if (l) void finishLaunch(l, 'done');
              else setStatus(`${popRitual.name} done.`);
            }}
          />
        )}
      </Sheet>
      <MissedLaunches
        launches={reminder ? [] : missedList}
        onLaunch={launchNow}
        onDone={(l) => finishLaunch(l, 'done')}
        onSkip={(l) => finishLaunch(l, 'skipped')}
        onClose={closeMissed}
      />
      <LaunchReminder
        launch={reminder}
        onLaunch={launchNow}
        titles={launches.map((l) => l.title)}
        onSnooze={(l, minutes, title) => {
          setSnoozed((m) => ({ ...m, [l.id]: Date.now() + minutes * 60_000 }));
          setReminder(null);
          if (title) void launchOps.save({ ...l, title });
          setStatus(`${title ?? l.title}: snoozed ${minutes} min.`);
        }}
        onEdit={(l, title) => {
          // Snoozed 10 so it doesn't pop straight back while you edit; a new time takes over.
          setSnoozed((m) => ({ ...m, [l.id]: Date.now() + 10 * 60_000 }));
          setReminder(null);
          const next = title ? { ...l, title } : l;
          if (title) void launchOps.save(next);
          setPage('launch');
          setEditLaunch(next);
        }}
        onSkip={(l) => finishLaunch(l, 'skipped')}
        onDone={(l) => finishLaunch(l, 'done')}
      />
      <TimeUpReminder
        launch={timeUp}
        onDone={(l) => {
          setTimeUp(null);
          finishLaunch(l, 'done');
        }}
        titles={launches.map((x) => x.title)}
        onMore={(l, minutes, title) => {
          setTimeUp(null);
          logLaunch(l, (g) => ({ extra: g.extra + minutes }));
          if (title) void launchOps.save({ ...l, title });
          setEndAlerted((m) => {
            const next = { ...m };
            delete next[runKey(l, new Date())];
            return next;
          });
          setStatus(`${title ?? l.title}: ${minutes} more minutes.`);
        }}
        onTomorrow={(l) => {
          setTimeUp(null);
          finishLaunch(l, 'skipped');
        }}
      />
      <RoutineEditor
        open={editor.open}
        routine={editor.routine}
        nextSort={routines.length}
        onClose={() => setEditor({ open: false, routine: null })}
        onSave={handleSaveRoutine}
        onDelete={handleDeleteRoutine}
        shift={shift}
        baseline={() => activeNonNegs(nonnegs).map((n) => n.label)}
        onTimed={(title, time) => {
          const r = editor.routine;
          const at = time
            ? (() => {
                const m = shiftMinutes(time, shift, !!r?.flips);
                return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
              })()
            : '09:00';
          setPage('launch');
          setTimedPreset({ fill: { title, atTime: at }, n: Date.now() });
        }}
        onNonNeg={(label) => {
          addNonNeg(label);
        }}
      />
      <SettingsPanel
        open={!!settingsOpen}
        section={settingsOpen || 'brand'}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSave}
        scrollMode={scrollMode}
        onScrollMode={(m) => {
          setScrollMode(m);
          writeScrollMode(m);
        }}
        onSetPassword={
          supabase && session
            ? async (password) => {
                const { error } = await supabase!.auth.updateUser({ password });
                if (error && /session/i.test(error.message)) {
                  // This device's sign-in has expired: send it back to the sign-in page.
                  await supabase!.auth.signOut({ scope: 'local' });
                  return 'This device was signed out. Sign in again, then set your password.';
                }
                return error ? error.message : null;
              }
            : undefined
        }
      />
    </div>
    </HiddenPicksContext.Provider>
    </MeditationsContext.Provider>
  );
}
