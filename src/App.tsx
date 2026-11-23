import { defaultStart, finishIso, leftRunningGuess, startIso } from './lib/logStart';
import { clashesFor, isAcked, settledRuns, type Clash } from './lib/schedule';
import { ClashSheet } from './components/ClashSheet';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { claimDevice, releaseDevice, unsyncedCount } from './lib/account';
import type { Session } from '@supabase/supabase-js';
import { OPENED_WITH, checkPassword, supabase } from './lib/supabase';
import { setDraftUser } from './lib/drafts';
import { booksOn, DEFAULT_SETTINGS, LIGHT_BACKGROUNDS, loadSettings, saveSettingsPatch, fontStack, fontWeights, applySettingsPatch, shownName, syncLinkedEmail, loadBgImages, saveBgImage, resolveBackground, EMPTY_SLOTS, type BgSlots, type BrandSettings } from './lib/settings';
import { downloadLaunchSheet } from './lib/launchSheet';
import { downloadRecords } from './lib/recordsSheet';
import { setWhatList, whatList } from './lib/whats';
import { launchFromTask, taskFromLaunch } from './lib/linkSync';
import { loadCached } from './lib/gcalCache';
import { Header, type PageId } from './components/Header';
import { FirstPassword } from './components/FirstPassword';
import { FeedbackFlag, SetupFeedback } from './components/Feedback';
import { HeaderClock } from './components/Clock';
import { ComingSoon, LaunchPageHome } from './components/Dashboard';
import { BudgetPage } from './components/Budget';
import { HeaderSearchContext, matchesSearch } from './lib/headerSearch';
import { byDate, decisionStore, type Decision } from './lib/decisions';
import { planStore, type Plan } from './lib/plans';
import { PlannerPanel } from './components/Planner';
import { BudgetCard } from './components/BudgetCard';
import { budgetStore, download as downloadText, linesToCsv, newBudgetLine, type BudgetLine } from './lib/budget';
import { rateToCad, toCad } from './lib/currency';
import { expenseFromLine, expenseStore, type Expense } from './lib/expenses';
import { billName, fromLine, moneyIn, sectionForTask, type LinkPlan } from './lib/links';
import { RoutinePicker } from './components/RoutinePicker';
import { RoutineEditor } from './components/RoutineEditor';
import { clearLegacyNonNegs, readLegacyNonNegs } from './lib/nonneg';
import { syncNonNegs } from './lib/nnsync';
import { meditationStore, MeditationsContext, type Meditation } from './lib/meditations';
import { hiddenPickStore, HiddenPicksContext, pickKey as hiddenKey, type HiddenPick } from './lib/hiddenPicks';
import { bankAccountStore, bankLineStore, commonStore, drawStore, type BankAccount, type BankLine, type CommonExpense, type Draw } from './lib/bank';
import type { ImportResult } from './components/BankImport';
import { customerStore, invoiceStore, profileStore, type Customer, type Invoice, type InvoiceProfile } from './lib/invoices';
import { RecordsPage } from './components/Records';
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
  scoreDay,
  snapshot,
  type Config,
  type DayRecord,
  type LogEntry,
  type NonNeg,
  type Quote
} from './lib/days26';
import { TodayPanel, useNow } from './components/TodayPanel';
import { BLOCKED_HELP, RocketsPanel, nameFromUrl, rocketOptions, type TimedPreset } from './components/Rockets';
import { LaunchReminder, MissedLaunches, TimeUpReminder } from './components/LaunchReminder';
import { chime, unlockAudioOnFirstGesture } from './lib/alerts';
import { EventForm, WeekCalendar } from './components/WeekCalendar';
import { TasksPage, TasksPanel, type TaskSeed } from './components/Tasks';
import { ProjectsManager } from './components/Projects';
import { logsProductivity, matchCalendar, projectStore, type Project } from './lib/projects';
import { buildJournalImport, byNewest, checkinsOf, journalStore, mergeJournal, newEntry, withCheckins, type JournalEntry } from './lib/journal';
import { JournalPanel } from './components/Journal';
import { Sheet } from './components/Sheet';
import { RitualRunner } from './components/Rituals';
import { buildImport, doneToday, isRecurring, newTask, repeatOf, taskName, taskStore, trashExpired, type ImportRow, type Task } from './lib/tasks';
import { addTaskToGoogle, googleConfigured, knownCalendars } from './lib/google';
import {
  isDue,
  isMissed,
  isoDate,
  launchStore,
  rocketStore,
  markHandled,
  unmarkHandled,
  openTabs,
  readHandled,
  skipToTomorrow,
  rocketsFor,
  splitShared,
  dedupeRoutines,
  type Launch,
  type LaunchLog,
  type TimeSource,
  type HandledHow,
  launchLogStore,
  runKey,
  setLaunchDayReset,
  setCardOpener,
  opensSomething,
  describeLog,
  logFor,
  happensToday,
  launchDate,
  clock12,
  timeFor,
  runStart,
  type Rocket
} from './lib/rockets';
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
import { SettingsPanel, type SettingsTab } from './components/SettingsPanel';
import { SignIn } from './components/SignIn';
import { Welcome } from './components/Welcome';
import { Tour } from './components/Tour';
import { Setup, resetSetupClock, setupStepFor } from './components/Setup';
import { BETA_MODULES, BOOKS_MODULES, BetaContext, BooksContext, booksPath, readLpMode, trackOf, writeLpMode, type LpMode } from './lib/beta';
import { CashBookCard, ExpensesCard, IncomeCard } from './components/BooksCards';
import { blankBooksFile, downloadBlob, launchSheetFile, newOnly, readBooksFile } from './lib/booksFile';
import { presetRecordsView } from './components/Records';
import { KnowledgeBasePage } from './components/KnowledgeBase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  // V20-337 (Dan, Nov 18): settings count as loaded only for the account they belong to. Signed out, the defaults
  // load for "no one"; without this, signing in briefly showed setup (defaults have no birthday) until your real
  // settings arrived.
  const [settingsFor, setSettingsFor] = useState<string | null | undefined>(undefined);
  const settingsLoaded = settingsFor === (session?.user.id ?? null);
  // V20-445 (Dan, Nov 20) PLATFORM RULE: no card ever draws its defaults or its empty message ("No steps yet",
  // "ADD A ROUTINE", "Nothing this week yet") before this account's data has loaded. The whole page waits, blank,
  // for every card's data (settings, background, routines, rockets, tasks, budget, planner, records…), max 6 s.
  // V20-444 (Dan, Nov 20): on a refresh, nothing shows until this account's own look and data are in: its background
  // image (not the tile it replaced), its rockets and routine (not the empty "ADD A ROUTINE" page). A blank page in
  // the last mode's colour shows meanwhile. Never stuck: after 6 s the page shows whatever has arrived.
  const [bgFor, setBgFor] = useState<string | null | undefined>(undefined);
  const [coreFor, setCoreFor] = useState<string | null | undefined>(undefined);
  const [planFor, setPlanFor] = useState<string | null | undefined>(undefined);
  const [bootGaveUp, setBootGaveUp] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setBootGaveUp(true), 6000);
    return () => window.clearTimeout(t);
  }, []);
  // V20-362 BETA MODE: testers always; the admin flips Main · Beta in ⚙ › Beta Testers (kept on this device).
  const isAdmin = session?.user.app_metadata?.role === 'admin';
  const [lpMode, setLpModeState] = useState<LpMode>(readLpMode);
  const setLpMode = (m: LpMode) => {
    writeLpMode(m);
    setLpModeState(m);
  };
  const beta = !isAdmin || lpMode !== 'main';
  // V20-453 (Dan, Nov 22): BETA TRACKS. A tester's track is on their account (set only by the invite function).
  // Books = the Books home (Budget, Expenses, Income), BOOKS logo. The admin sees it by signing in as a Books test account.
  const books = !isAdmin && trackOf(session?.user.app_metadata) === 'books';
  // V20-464 (Dan, Nov 22): the Books overview's month, set by the Cash Book's ‹ ›; the Expenses and Income cards follow it.
  const [booksMonth, setBooksMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7));
  const booksDay = new Date(Number(booksMonth.slice(0, 4)), Number(booksMonth.slice(5, 7)) - 1, 1);
  /** The modules in force: beta mode's fixed MVP set, or the account's own switches (main). */
  const mods = books ? BOOKS_MODULES : beta ? BETA_MODULES : settings.modules;
  useEffect(() => {
    // V20-453: the tab says BOOKS on the Books track (and on /books before signing in).
    document.title = books || booksPath() ? 'BOOKS · L4UNCH P4GE' : 'LaunchPage';
  }, [books]);
  // V20-358 (BETA BACKEND tracking): count which days this account opens the app (once per visit, and again when
  // the tab comes back after 30+ minutes away). Never what's in it. Table app_opens (0068); fails quietly.
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid || !supabase) return;
    const db = supabase;
    let hiddenAt = 0;
    const record = () => void db.rpc('record_open', { p_day: isoDate(new Date()) }).then(() => undefined, () => undefined);
    record();
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) record();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [session?.user.id]);
  setDraftUser(session?.user.id);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [settingsOpen, setSettingsOpen] = useState<false | SettingsTab>(false);
  // V20-129: your own background images, one per tile slot.
  const [bgSlots, setBgSlots] = useState<BgSlots>(EMPTY_SLOTS);
  // V20-189: messages are still set (for later), but the footer no longer shows them.
  const [, setStatus] = useState('');
  // A page in the address (#tasks, #budget…) opens there: card rockets from a timed launch use it.
  const [page, setPage] = useState<PageId>(() => {
    const h = window.location.hash.replace('#', '');
    if (h === 'records') return 'invoices';
    return (['launch', 'tasks', 'days26', 'budget', 'invoices', 'journal', 'kb'] as PageId[]).includes(h as PageId) ? (h as PageId) : 'launch';
  });
  useEffect(() => {
    // Keep the address on the page you're on, so a refresh stays there.
    const want = page === 'launch' ? '' : `#${page}`;
    if (window.location.hash !== want) history.replaceState(null, '', `${window.location.pathname}${want}`);
  }, [page]);
  // Phones fold the headline out of the fixed header once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  // V20-095 (Dan, Nov 12): every page opens at its top, so the Launch Page always comes back at Rockets /
  // Timed launches (it kept the old scroll, e.g. down at Personal Alchemy after a trip to Budget).
  // V20-097: the Tasks page's ^ goes back to the Tasks card itself, not the top.
  const returnTo = useRef<string | null>(null);
  // SCHEDULE GUARDRAILS: a launch just saved on top of another block (the after-save check).
  const [appClash, setAppClash] = useState<{ l: Launch; with: Clash[] } | null>(null);
  // V20-294: signed out, Welcome comes first.
  // V20-434 (Dan, Nov 20): an email link that was already used or has expired comes back with an error in the address.
  // Open the sign-in page with a plain message instead of the Welcome page saying nothing.
  const [linkError] = useState<string | null>(() => {
    try {
      const q = new URLSearchParams(OPENED_WITH);
      if (!q.get('error') && !q.get('error_code')) return null;
      window.history.replaceState(null, '', window.location.pathname);
      return q.get('error_code') === 'otp_expired' || /expired|invalid/i.test(q.get('error_description') ?? '')
        ? 'That email link was already used or has expired. Each link works once. Sign in, or tap Email me a sign-in link for a new one.'
        : `That email link didn't work: ${q.get('error_description') ?? q.get('error')}. Tap Email me a sign-in link for a new one.`;
    } catch {
      return null;
    }
  });
  const [signedOut, setSignedOut] = useState<'welcome' | 'tour' | 'signin' | 'signup'>(() => (linkError ? 'signin' : 'welcome'));
  const [tourAt, setTourAt] = useState(0);
  // V20-269: the budget line picked on the Budget card, opened in Edit line on the Budget page.
  const [budgetOpen, setBudgetOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = returnTo.current;
    returnTo.current = null;
    const el = id ? document.getElementById(id)?.closest('section') : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    // V20-383 (Dan, Nov 19, iPhone): on phones the header never changes size while you scroll (its shrinking made the
    // page jump and stopped it scrolling back up), so 'scrolled' is for wider screens only.
    const onScroll = () => setScrolled(window.scrollY > 24 && !window.matchMedia('(max-width: 700px)').matches);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shift, setShift] = useState<Shift>('nights');
  const [routineProblem, setRoutineProblem] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; routine: Routine | null }>({ open: false, routine: null });
  const [rockets, setRockets] = useState<Rocket[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // V20-247 (Dan, Nov 14): Project Planner decisions.
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  // V20-183: the app-wide Log the time? (for Done from the reminder, Missed pop-up, Time's up and rituals).
  const [timeAsk, setTimeAsk] = useState<{ l: Launch; minutes: number; q: string; start?: string } | null>(null);
  // V20-214 (Dan, Nov 14): a launch saved for today after its time has passed asks once: started at the set
  // time (the clock runs from then), already done (Log the time?), or not started (Missed, as before).
  const [pastAsk, setPastAsk] = useState<Launch | null>(null);
  // V20-245 (Dan, Nov 14): one search in the header, on every page (KNOWLEDGE!B4SE has its own). The round teal key
  // button pops out the beige pill; the page you're on filters itself. Clears when you change page.
  const [headerQ, setHeaderQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // V20-224: the font theme lives on <html>, so everything (body text, pop-ups) picks it up.
  useEffect(() => {
    // V20-235: wait for the real settings (the page already carries the last theme), so the default never flashes.
    if (!settingsLoaded) return;
    const root = document.documentElement;
    root.dataset.font = settings.fontTheme;
    // V20-229: YOURS = your three fonts, loaded from Google Fonts when picked.
    const c = settings.fontCustom;
    if (settings.fontTheme === 'yours') {
      root.style.setProperty('--font-head', fontStack(c.head));
      root.style.setProperty('--font-body', fontStack(c.body));
      root.style.setProperty('--font-mono', fontStack(c.mono));
    } else ['--font-head', '--font-body', '--font-mono'].forEach((v) => root.style.removeProperty(v));
    const want = settings.fontTheme === 'yours' ? [c.head, c.body, c.mono] : [];
    const href = want.length
      ? `https://fonts.googleapis.com/css2?${[...new Set(want)].map((f) => `family=${f.trim().replace(/ /g, '+')}${fontWeights(f)}`).join('&')}&display=swap`
      : '';
    let link = document.getElementById('font-yours') as HTMLLinkElement | null;
    if (href && !link) {
      link = document.createElement('link');
      link.id = 'font-yours';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link && link.href !== href) link.href = href;
  }, [settings.fontTheme, settings.fontCustom, settingsLoaded]);
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
  // V20-015 bookkeeping: bank accounts, imported statement lines, Common Expenses, draws.
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [common, setCommon] = useState<CommonExpense[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [medReady, setMedReady] = useState(false);
  const tasksRef = useRef<Task[]>([]);
  const [gcalOff, setGcalOff] = useState(0);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  // V20-210: a task to open for editing on the Tasks page (from a project's What list).
  const [editTask, setEditTask] = useState<string | null>(null);
  // V20-083: a new calendar event with Add a task too opens Add task filled in.
  const [taskPreset, setTaskPreset] = useState<{ fill: Partial<Task>; n: number; seed?: TaskSeed } | null>(null);
  // V20-126 (Dan, Nov 12): card by card is the only way the page scrolls (the Free / Card by card setting is gone).
  // The routine following the time beside the cards comes back as a switch in Settings › Modules.
  const scrollMode = 'cards' as const;
  // Card by card: the page snaps to each card; the header's height keeps cards clear of it.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('snap-scroll');
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar) return;
    const ro = new ResizeObserver(() => root.style.setProperty('--header-h', `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, [authReady, session]);
  useEffect(() => {
    setHeaderQ('');
    setSearchOpen(false);
  }, [page]);
  const importInput = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  // V20-175 (Dan, Nov 13): a project switched off (archived) takes its tasks off the Tasks card and page; they stay
  // in the data and come back when it's switched on. An area switched off hides its projects' tasks too.
  const archivedIds = useMemo(() => {
    const off = new Set(projects.filter((p) => p.status === 'archived').map((p) => p.id));
    for (const p of projects) if (p.parentId && off.has(p.parentId)) off.add(p.id);
    return off;
  }, [projects]);
  const shownTasks = useMemo(() => (archivedIds.size ? tasks.filter((t) => !t.projectId || !archivedIds.has(t.projectId)) : tasks), [tasks, archivedIds]);
  // eslint-disable-next-line react-hooks/refs
  tasksRef.current = tasks;
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
  const [handledHere, setHandled] = useState(() => readHandled());
  const [timeUp, setTimeUp] = useState<Launch | null>(null);
  // Each run of a timed launch (launched, +10s, done or skipped), kept for 26 Days.
  const [launchLog, setLaunchLog] = useState<LaunchLog[]>([]);
  const logRef = useRef<LaunchLog[]>([]);
  logRef.current = launchLog;
  const d26TodayRef = useRef('');
  /**
   * V20-178 (Nov 13): minutes on the clock so far when a launched run has gone more than an hour past
   * its time (left running), else null. Done then asks Log the time? instead of saving every minute.
   */
  const overrun = (l: Launch): number | null => {
    const run = logFor(logRef.current, l, new Date());
    if (!run.launchedAt) return null;
    const on = (Date.now() - new Date(run.launchedAt).getTime()) / 60_000 - pausedMin(l);
    return on > (run.planned || l.minutes) + run.extra + 60 ? Math.round(on) : null;
  };
  function logLaunch(l: Launch, patch: (g: LaunchLog) => Partial<LaunchLog>) {
    const list = logRef.current;
    const cur = logFor(list, l, new Date());
    // V20-074: each run carries the launch's project as it was when the run happened.
    const changed = patch(cur);
    // V20-280: a launch's steps are part of its name in the record (dash-separated).
    const item = { ...cur, ...changed, title: [l.title, ...(l.steps ?? [])].join(' - '), projectId: l.projectId ?? null };
    // V20-178: a run finished now belongs to today's routine day (where its productivity block goes).
    if (changed.finishedAt) item.routineDay = d26TodayRef.current;
    const next = list.some((g) => g.id === item.id) ? list.map((g) => (g.id === item.id ? item : g)) : [...list, item];
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.save(userId, item, next);
  }
  // Oct 26: minutes added with More time, from the same day the log saved them under (the launch's
  // routine day, not the calendar date, so a night block past midnight still finds them).
  const extraToday = (l: Launch) => logFor(launchLog, l, now).extra;
  // The launch log has loaded: until then the end alarm can't see minutes already added.
  const [logReady, setLogReady] = useState(false);
  // V20-068 (Nov 12): the saved log decides. Once it has loaded, a done / skipped / launched mark kept in this
  // browser only counts if the log has that run too (the log syncs to every device; the mark doesn't, and a
  // run taken out of the log, by Undo or by hand, left the mark behind showing 'done today'). Hourly runs
  // keep the browser mark.
  // V20-079 (Nov 12): and the other way: every saved run marks its launch as launched / done / skipped on
  // every device, so a run done on the laptop isn't still to do on the phone.
  const handled = useMemo(() => {
    if (!logReady) return handledHere;
    const fromLog: Record<string, HandledHow | true> = {};
    for (const g of launchLog) {
      fromLog[`${g.launchId}:${g.day}`] =
        g.outcome === 'launched' ? (g.finishedAt ? 'done' : 'launched') : g.outcome === 'done' ? 'done' : 'skipped';
    }
    // Hourly runs keep this browser's marks (their log line is per day, not per hour).
    for (const [k, v] of Object.entries(handledHere)) if (k.includes('@')) fromLog[k] = v as HandledHow | true;
    return fromLog;
  }, [logReady, handledHere, launchLog]);
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
  // V12-003 (Nov 12): the pause now lives on the run (synced), so every device sees it and time spent leaves
  // breaks out. A run with no pause saved on it falls back to this browser's old copy.
  const runOf = (l: Launch, at: number) => {
    const day = isoDate(launchDate(l, new Date(at)));
    return logRef.current.find((g) => g.launchId === l.id && g.day === day);
  };
  const pauseOf = (l: Launch, at = Date.now()): { at: number | null; min: number } => {
    const run = runOf(l, at);
    if (run && ((run.pausedMin ?? 0) > 0 || run.pausedAt)) return { at: run.pausedAt ? new Date(run.pausedAt).getTime() : null, min: run.pausedMin ?? 0 };
    return paused[runKey(l, new Date(at))] ?? { at: null, min: 0 };
  };
  const pausedMin = (l: Launch, at = Date.now()) => {
    const p = pauseOf(l, at);
    return p.min + (p.at ? (at - p.at) / 60_000 : 0);
  };
  const isPaused = (l: Launch) => !!pauseOf(l).at;
  function togglePause(l: Launch) {
    const key = runKey(l, new Date());
    const cur = pauseOf(l);
    const t = Date.now();
    const next = cur.at ? { at: null, min: cur.min + (t - cur.at) / 60_000 } : { ...cur, at: t };
    setPaused((m) => ({ ...m, [key]: next }));
    logLaunch(l, () => ({ pausedMin: next.min, pausedAt: next.at ? new Date(next.at).toISOString() : null }));
    setStatus(next.at ? `${l.title}: paused. The clock stops until you resume.` : `${l.title}: resumed (${Math.round(next.min)} min paused).`);
  }
  // V20-080 (Nov 12): a pop-up closes itself once its run was handled on another device: Time's up when the
  // run got more time or was checked off / skipped; the launch reminder once the run was started or settled.
  const timeUpExtra = useRef(0);
  useEffect(() => {
    if (timeUp) {
      const run = logFor(launchLog, timeUp, new Date());
      if (run.finishedAt || run.outcome === 'skipped' || run.outcome === 'cleared' || run.extra > timeUpExtra.current) setTimeUp(null);
    }
    // Hourly launches have one log line a day, so their reminder isn't closed this way.
    if (reminder && reminder.repeat !== 'hourly') {
      const run = launchLog.find((g) => g.launchId === reminder.id && g.day === logFor(launchLog, reminder, new Date()).day);
      if (run) setReminder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchLog]);
  // V20-064 (Nov 11): which runs already had Time's up, kept on this device so a refresh doesn't pop it
  // again. More time clears the run's mark (so it pops when the added time is up). Kept for 3 days.
  const [endAlerted, setEndAlerted] = useState<Record<string, true>>(() => {
    try {
      const all = JSON.parse(localStorage.getItem('launchpage.launches.endalerted.v1') ?? '{}') as Record<string, true>;
      const since = isoDate(new Date(Date.now() - 3 * 86_400_000));
      return Object.fromEntries(Object.entries(all).filter(([k]) => (k.split(':')[1] ?? '').slice(0, 10) >= since)) as Record<string, true>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('launchpage.launches.endalerted.v1', JSON.stringify(endAlerted));
    } catch {
      /* ignore */
    }
  }, [endAlerted]);

  useEffect(() => unlockAudioOnFirstGesture(), []);
  const now = useNow(30_000);

  const userId = session?.user.id ?? null;

  // V20-006: this browser's copy belongs to one account. A different account starts clean
  // (and the page reloads, so nothing of the last account stays in memory). Runs before any load.
  // V20-436 (Dan, Nov 20; was V20-417, redone on its own): while it switches accounts, show a blank white page, never a
  // flash of the last account's Launch Page (this re-renders before the browser paints).
  const [switchingAccount, setSwitchingAccount] = useState(false);
  useLayoutEffect(() => {
    if (userId && claimDevice(userId) === 'wiped') {
      setSwitchingAccount(true);
      window.location.reload();
    }
  }, [userId]);
  // V20-430 (Dan, Nov 20; was V20-418): an account with no password of its own yet (an invite, or email links only)
  // sets one first, before setup and the Launch Page. has_password() (0074) ignores the hidden password Supabase
  // gives every invite. "Later" waits until this browser next opens the app.
  const [needsPassword, setNeedsPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [pwLater, setPwLater] = useState(() => {
    try {
      return sessionStorage.getItem('lp.pwLater') === '1';
    } catch {
      return false;
    }
  });
  // V20-435 (Dan, Nov 20; was V20-421, redone safer): until the password answer is in, the page stays blank, so setup
  // or the Launch Page never flashes before Set a password. Never stuck: any error, or no answer in 4 s, carries on.
  // An account already known to have a password on this browser doesn't wait at all.
  const pwKnownKey = (id: string) => `lp.hasPw.${id}`;
  const [pwCheckedFor, setPwCheckedFor] = useState<string | null>(null);
  const pwKnown = (id: string) => {
    try {
      return localStorage.getItem(pwKnownKey(id)) === '1';
    } catch {
      return false;
    }
  };
  useEffect(() => {
    setNeedsPassword(false);
    if (!supabase || !userId) return;
    let live = true;
    const done = () => {
      if (live) setPwCheckedFor(userId);
    };
    const timer = window.setTimeout(done, 4000);
    supabase
      .rpc('has_password')
      .then(({ data, error }) => {
        if (!live) return;
        if (!error && data === false) setNeedsPassword(true);
        try {
          if (!error && data === true) localStorage.setItem(pwKnownKey(userId), '1');
          else localStorage.removeItem(pwKnownKey(userId));
        } catch {
          /* ignore */
        }
        done();
      })
      .then(undefined, done);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [userId]);
  /** Sign out (⚙ menu): clears this browser's copy, after a warning if changes haven't synced. */
  async function signOutClean() {
    const n = unsyncedCount();
    if (n && !window.confirm(`${n} change${n === 1 ? " hasn't" : "s haven't"} reached the cloud yet. Signing out now loses ${n === 1 ? 'it' : 'them'}. Sign out anyway?`)) return;
    await supabase?.auth.signOut({ scope: 'local' });
    releaseDevice();
    window.location.reload();
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s);
      // V20-432 (Nov 20): a password-reset link signs you in; go straight to set a new password (no Later skip).
      if (e === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let live = true;
    loadSettings(userId).then((x) => {
      if (!live) return;
      setSettings(x);
      setSettingsFor(userId);
    });
    loadBgImages(userId).then((b) => {
      if (!live) return;
      setBgSlots(b);
      setBgFor(userId);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  useEffect(() => {
    if (supabase && !session) return;
    let live = true;
    void Promise.all([
      decisionStore.load(userId).then((r) => live && setDecisions(r.items)),
      planStore.load(userId).then((r) => live && setPlans(r.items))
    ]).then(() => live && setPlanFor(userId));
    planStore.onNewer((id, newer) => setPlans((l) => (newer ? l.map((x) => (x.id === id ? newer : x)) : l.filter((x) => x.id !== id))));
    decisionStore.onNewer((id, newer) => setDecisions((l) => (newer ? l.map((x) => (x.id === id ? newer : x)) : l.filter((x) => x.id !== id))));
    return () => {
      live = false;
    };
  }, [userId, session]);

  useEffect(() => {
    if (supabase && !session) return;
    let live = true;
    (async () => {
      const loaded = await loadRoutines(userId);
      let list = loaded.routines;
      const active = await loadActive(userId);
      if (!live) return;
      const [l1, l2, l3] = await Promise.all([rocketStore.load(userId), launchStore.load(userId), eventStore.load(userId)]);
      if (!live) return;
      let tiles = l1.items;
      // One tile set per routine: copy any shared tiles into each routine, then drop the shared ones.
      const split = splitShared(tiles, list.map((r) => r.id));
      if (split) {
        tiles = split.next;
        for (const c of split.copies) await rocketStore.save(userId, c, tiles);
        for (const sh of split.shared) await rocketStore.remove(userId, sh.id, tiles);
      }
      // Routines saved twice: keep one of each, moving any tiles it lacks onto it.
      const dupes = dedupeRoutines(list, tiles, active.id);
      if (dupes) {
        list = dupes.routines;
        tiles = dupes.rockets;
        for (const l of dupes.moved) await rocketStore.save(userId, l, tiles);
        for (const id of dupes.dropTiles) await rocketStore.remove(userId, id, tiles);
        for (const r of dupes.dropRoutines) await deleteRoutine(userId, r.id, list);
      }
      if (!live) return;
      setRoutines(list);
      setRoutineProblem(loaded.problem);
      setActiveId(list.some((r) => r.id === active.id) ? active.id : list[0]?.id ?? null);
      setShift(active.shift);
      setRockets(tiles);
      setLaunches(l2.items);
      setEvents(l3.items);
      const [p1, t1, j1, g1] = await Promise.all([projectStore.load(userId), taskStore.load(userId), journalStore.load(userId), launchLogStore.load(userId)]);
      if (!live) return;
      setLaunchLog(g1.items);
      setLogReady(true);
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
      const [ba, bl, ce, dr] = await Promise.all([bankAccountStore.load(userId), bankLineStore.load(userId), commonStore.load(userId), drawStore.load(userId)]);
      if (!live) return;
      setBankAccounts(ba.items);
      setBankLines(bl.items);
      setCommon(ce.items);
      setDraws(dr.items);
      setMedReady(true);
      // V20-445: every card's data is in.
      setCoreFor(userId);
      setStoreProblem(l1.problem ?? l2.problem ?? l3.problem ?? p1.problem ?? t1.problem ?? j1.problem ?? n1.problem ?? dd.problem ?? lg.problem);
    })();
    return () => {
      live = false;
    };
  }, [userId, session]);

  // Rituals are kept for 26 Days but no longer picked or shown on the Launch Page.
  const shownRoutines = routinesOnly(routines);
  const activeRoutine = shownRoutines.find((r) => r.id === activeId) ?? shownRoutines[0] ?? null;
  // V20-199: the file-name prefix every export shares, the same as the Launch Sheet's (STARDVST-LTD).
  const exportBrand = () =>
    ((settings.account.businessName || '').trim() || shownName(settings).trim() || 'L4UNCH!P4GE').toUpperCase().replace(/[^A-Za-z0-9!_-]+/g, '-').replace(/^-|-$/g, '') || 'LAUNCH-SHEET';
  // V20-158: pages switched off in Settings › Modules leave the menu (and send you to the Launch Page).
  const hiddenPages = ([['days26', mods.days26], ['budget', mods.budget], ['invoices', booksOn(mods) || mods.invoice], ['kb', mods.kb !== false], ['tasks', mods.tasks], ['planner', mods.planner]] as const)
    .filter(([, on]) => !on)
    .map(([id]) => id) as PageId[];
  const hiddenPagesKey = hiddenPages.join(',');
  useEffect(() => {
    if (settingsLoaded && hiddenPages.includes(page)) setPage('launch');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenPagesKey, page, settingsLoaded]);
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
  // V20-009: when a save finds the record changed (or deleted) on another device, the newer copy
  // wins: it replaces this device's copy on screen, and the status line says so.
  useEffect(() => {
    const swap =
      <T extends { id: string }>(set: (fn: (prev: T[]) => T[]) => void, ref?: { current: T[] }) =>
      (id: string, item: T | null) => {
        set((prev) => {
          const next = item ? (prev.some((x) => x.id === id) ? prev.map((x) => (x.id === id ? item : x)) : [...prev, item]) : prev.filter((x) => x.id !== id);
          if (ref) ref.current = next;
          return next;
        });
        setStatus(item ? 'Changed on another device, so the newer version is showing. Make your change again if it still needs it.' : 'That was deleted on another device.');
      };
    rocketStore.onNewer(swap(setRockets));
    launchStore.onNewer(swap(setLaunches));
    eventStore.onNewer(swap(setEvents));
    projectStore.onNewer(swap(setProjects));
    taskStore.onNewer(swap(setTasks, tasksRef));
    nonNegStore.onNewer(swap(setNonnegs));
    quoteStore.onNewer(swap(setQuotes));
    budgetStore.onNewer(swap(setBudget));
    invoiceStore.onNewer(swap(setInvoices));
    customerStore.onNewer(swap(setCustomers));
    profileStore.onNewer(swap(setInvoiceProfile));
    bankAccountStore.onNewer(swap(setBankAccounts));
    bankLineStore.onNewer(swap(setBankLines));
    commonStore.onNewer(swap(setCommon));
    drawStore.onNewer(swap(setDraws));
    meditationStore.onNewer(swap(setMeditations, medsRef));
    hiddenPickStore.onNewer(swap(setHiddenPicks, hiddenRef));
    expenseStore.onNewer(swap(setExpenses, expRef));
    dayStore.onNewer(swap(setD26Days, daysRef));
    logStore.onNewer(swap(setD26Logs, logsRef));
    journalStore.onNewer((id, item) => journalTheirs.current.set(id, item));
    launchLogStore.onNewer(swap(setLaunchLog, logRef));
    configStore.onNewer((_id, c) => c && setD26Config(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // V20-011: changes that couldn't reach the cloud (no signal on site) go as soon as the
  // connection is back, or when the app comes back into view, not only on the next reload.
  useEffect(() => {
    if (!userId) return;
    const stores = [rocketStore, launchStore, eventStore, projectStore, taskStore, nonNegStore, quoteStore, budgetStore, invoiceStore, customerStore, profileStore, bankAccountStore, bankLineStore, commonStore, drawStore, meditationStore, hiddenPickStore, expenseStore, dayStore, logStore, journalStore, launchLogStore, configStore] as Store<{ id: string }>[];
    let busy = false;
    const flushAll = async () => {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        let sent = 0;
        for (const st of stores) sent += await st.flush(userId);
        if (sent) setStatus(`Back online: ${sent} change${sent === 1 ? '' : 's'} saved to the cloud.`);
      } finally {
        busy = false;
      }
    };
    // V20-080 (Nov 12): timed launches and their runs reload when the app comes back into view and every
    // minute while it's open, so a pause, More time or a check-off on another device shows here without
    // closing the app.
    let fetching = false;
    const refreshLive = async () => {
      if (fetching || !navigator.onLine || document.visibilityState !== 'visible') return;
      fetching = true;
      try {
        await flushAll();
        const [ls, lg] = await Promise.all([launchStore.load(userId), launchLogStore.load(userId)]);
        if (lg.items.length) {
          logRef.current = lg.items;
          setLaunchLog(lg.items);
        }
        if (ls.items.length) setLaunches(ls.items);
      } finally {
        fetching = false;
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void refreshLive();
    window.addEventListener('online', flushAll);
    document.addEventListener('visibilitychange', onVisible);
    const every = window.setInterval(flushAll, 120_000);
    const live = window.setInterval(refreshLive, 60_000);
    return () => {
      window.removeEventListener('online', flushAll);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(every);
      window.clearInterval(live);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function ops<T extends { id: string }>(store: Store<T>, list: T[], setList: (l: T[]) => void, name: (t: T) => string) {
    return {
      save: async (item: T) => {
        const next = list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
        setList(next);
        const ok = await store.save(userId, item, next);
        // 'newer': the newer copy from another device is showing, with its own message.
        if (ok !== 'newer') setStatus(ok ? `${name(item)} saved.` : `${name(item)} saved on this device only.`);
      },
      /** Several at once (a reorder), so no save works from a stale list. */
      saveMany: async (items: T[]) => {
        const byId = new Map(items.map((i) => [i.id, i]));
        const next = [...list.map((x) => byId.get(x.id) ?? x), ...items.filter((i) => !list.some((x) => x.id === i.id))];
        setList(next);
        let ok = true;
        let newer = false;
        for (const i of items) {
          const r = await store.save(userId, i, next);
          if (r === 'newer') newer = true;
          ok = !!r && ok;
        }
        if (!newer) setStatus(ok ? 'Saved.' : 'Saved on this device only.');
      },
      remove: async (id: string) => {
        const next = list.filter((x) => x.id !== id);
        setList(next);
        await store.remove(userId, id, next);
        setStatus('Deleted.');
      }
    };
  }
  const rocketOps = ops(rocketStore, rockets, setRockets, (l) => l.name);
  const launchOps = ops(launchStore, launches, setLaunches, (l) => l.title);
  // Oct 25: a launch saved with a new time drops its snooze, so it pops up at the new time
  // (Snooze → Edit snoozes 10 minutes, which hid an edit to 3 minutes from now).
  function saveLaunchEdit(input: Launch, fromTask = false) {
    // V20-351: STARTED AT (new launch, time already gone today): on the clock since its set time, no pop-up.
    const { startedThen, ...l } = input;
    const old = launches.find((x) => x.id === l.id);
    const moved = !old || old.atTime !== l.atTime || old.onDate !== l.onDate || JSON.stringify(old.onceTime) !== JSON.stringify(l.onceTime) || old.repeat !== l.repeat;
    if (moved && snoozed[l.id]) {
      setSnoozed((m) => {
        const next = { ...m };
        delete next[l.id];
        return next;
      });
    }
    // V20-201: the task it was made from follows (name while they match, date / time, project, link).
    if (old && !fromTask) {
      const linked = tasksRef.current.filter((t) => t.launchId === l.id && !t.deletedAt);
      const changed = linked.map((t) => taskFromLaunch(old, l, t)).filter((t): t is Task => !!t);
      if (changed.length) void taskOps.saveMany(changed);
    }
    const n = new Date();
    if (!fromTask && moved && l.active && l.repeat !== 'hourly' && happensToday(l, n) && !handled[runKey(l, n)]) {
      const start = new Date(`${isoDate(launchDate(l, n))}T${timeFor(l, n)}:00`).getTime();
      // CP-035: a launch set to this very minute (START NOW in the form) isn't 'passed'; its pop-up fires as normal.
      const run = logFor(logRef.current, l, n);
      if (startedThen && !run.launchedAt) {
        setHandled(markHandled(l, n, 'launched'));
        logLaunch(l, () => ({ outcome: 'launched', launchedAt: new Date(start).toISOString(), planned: l.minutes }));
        setStatus(`${l.title}: on the clock since ${clock12(timeFor(l, n))}.`);
      } else if (start <= n.getTime() - 60000 && !run.launchedAt) setPastAsk(l);
    }
    // V20-351 (Dan, Nov 19): a block already running, moved to an earlier time today: its run starts at the new time.
    if (!fromTask && old && moved && l.repeat !== 'hourly' && happensToday(l, n)) {
      const run = logFor(logRef.current, l, n);
      const start = new Date(`${isoDate(launchDate(l, n))}T${timeFor(l, n)}:00`).getTime();
      if (run.launchedAt && !run.finishedAt && start < new Date(run.launchedAt).getTime()) {
        logLaunch(l, () => ({ launchedAt: new Date(start).toISOString() }));
        setStatus(`${l.title}: on the clock since ${clock12(timeFor(l, n))}.`);
      }
    }
    // SCHEDULE GUARDRAILS (Dan, Nov 16): any save that lands a launch on top of another block (a task's time,
    // + Tomorrow, a push) asks after saving, unless the launch form already asked.
    if (moved) checkClash(l);
    return launchOps.save(l);
  }
  function checkClash(l: Launch) {
    if (isAcked(l)) return;
    // V20-288: timed tasks count too.
    const c = clashesFor(l, [...launches, ...taskStands()], new Date(), settledRuns(logRef.current));
    if (c.length) setAppClash({ l, with: c });
  }
  function answerPast(how: 'started' | 'now' | 'done' | 'not') {
    const l = pastAsk;
    setPastAsk(null);
    if (!l) return;
    const n = new Date();
    if (how === 'started') {
      const at = new Date(`${isoDate(launchDate(l, n))}T${timeFor(l, n)}:00`).toISOString();
      setHandled(markHandled(l, n, 'launched'));
      logLaunch(l, () => ({ outcome: 'launched', launchedAt: at, planned: l.minutes }));
      setStatus(`${l.title}: on the clock since ${clock12(timeFor(l, n))}.`);
    } else if (how === 'now') launchNow(l);
    else if (how === 'done') void finishLaunch(l, 'done');
  }
  /** V20-201: deleting a launch keeps its task, unlinked. */
  async function deleteLaunch(id: string) {
    await launchOps.remove(id);
    const linked = tasksRef.current.filter((t) => t.launchId === id);
    if (linked.length) await taskOps.saveMany(linked.map((t) => ({ ...t, launchId: null })));
  }
  const eventOps = ops(eventStore, events, setEvents, (e) => e.title);
  const projectOps = ops(projectStore, projects, setProjects, (p) => p.name);
  const decisionOps = ops(decisionStore, decisions, setDecisions, (d) => d.title || 'Decision');
  const planOps = ops(planStore, plans, setPlans, (p) => p.name || 'Plan');
  const taskOps = ops(taskStore, tasks, setTasks, (t) => taskName(t));
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
  const drawOps = ops(drawStore, draws, setDraws, (d) => d.description || 'Draw');
  const bankLineOps = ops(bankLineStore, bankLines, setBankLines, (l) => l.income?.description || 'Deposit');

  /** V20-458 (Dan, Nov 22): the Books track's books file (.xlsx with Budget / Expenses / Income tabs, or one tab as .csv):
   *  read, count, ask, then add only what isn't here yet (same date, description and amount). */
  async function importBooksFile(file: File) {
    let found;
    try {
      found = await readBooksFile(file);
    } catch (e) {
      return setStatus((e as Error).message || 'Couldn\'t read that file.');
    }
    const fresh = newOnly(found, { budget, expenses: expRef.current, lines: bankLines, draws, accounts: bankAccounts });
    const sheet = fresh.sheet;
    const total = fresh.budget.length + (sheet?.lines.length ?? 0);
    if (!found.budget.length && !found.sheet?.lines.length) {
      return setStatus('Nothing to import: no rows found in LINES, EXPENSES, PERSONAL EXPENSES, INCOME, DRAWS or BUDGET. Use the blank Launch Sheet\'s columns.');
    }
    if (!total) return setStatus(`Everything in ${file.name} is already here (${fresh.skipped} lines).`);
    const n = (k: string) => sheet?.lines.filter((l) => l.route === k).length ?? 0;
    // V20-459: the opening balance comes from the sheet's Balance column when the cash book hasn't got one yet.
    const opening = !settings.account.cashBook && sheet?.lines.length ? sheet.opening : null;
    const parts = [
      sheet?.lines.length
        ? `${sheet.lines.length} line${sheet.lines.length === 1 ? '' : 's'} (${n('expense')} expenses, ${n('income') + n('interest')} money in, ${n('draw')} draws, ${n('personal')} personal, ${n('transfer')} transfers)`
        : '',
      fresh.budget.length ? `${fresh.budget.length} budget line${fresh.budget.length === 1 ? '' : 's'}` : ''
    ].filter(Boolean);
    const openNote = opening ? `\n\nCash Book opening balance: ${opening.opening.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })} at the start of ${new Date(`${opening.start}-01T12:00`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })} (worked out from the Balance column; change it any time).` : '';
    const from = found.tabs.length ? ` (from ${found.tabs.join(', ')})` : '';
    if (!window.confirm(`Add ${parts.join(', ')}${from}?${fresh.skipped ? ` ${fresh.skipped} already here, skipped.` : ''}${openNote}`)) return;
    if (sheet?.lines.length) {
      setStatus(`Importing ${sheet.lines.length} lines… a big file can take a minute.`);
      const after = <T extends { sort: number }>(have: T[], add: T[]) => {
        const start = have.reduce((m, x) => Math.max(m, x.sort + 1), 0);
        return add.map((x, i) => ({ ...x, sort: start + i }));
      };
      await saveImport({ accounts: after(bankAccounts, sheet.accounts), lines: after(bankLines, sheet.lines), expenses: after(expRef.current, sheet.expenses), draws: after(draws, sheet.draws), common: [], invoices: [], profile: null });
    }
    if (opening) await handleSave({ account: { ...settings.account, cashBook: opening } as BrandSettings['account'] });
    const base = budget.reduce((m, l) => Math.max(m, l.sort + 1), 0);
    if (fresh.budget.length) await budgetOps.saveMany(fresh.budget.map((l, i) => ({ ...l, sort: base + i })));
    setStatus(`Imported ${parts.join(', ')} from ${file.name}.`);
  }

  /** V20-015: a confirmed bank import, saved list by list (each in one go). */
  async function saveImport(r: ImportResult) {
    const many = async <T extends { id: string }>(store: Store<T>, list: T[], set: (l: T[]) => void, items: T[]) => {
      if (!items.length) return true;
      const byId = new Map(items.map((i) => [i.id, i]));
      const next = [...list.map((x) => byId.get(x.id) ?? x), ...items.filter((i) => !list.some((x) => x.id === i.id))];
      set(next);
      let ok = true;
      for (const i of items) ok = !!(await store.save(userId, i, next)) && ok;
      return ok;
    };
    const oks = await Promise.all([
      many(bankAccountStore, bankAccounts, setBankAccounts, r.accounts),
      many(expenseStore, expenses, setExpenses, r.expenses),
      many(drawStore, draws, setDraws, r.draws),
      many(commonStore, common, setCommon, r.common),
      many(invoiceStore, invoices, setInvoices, r.invoices),
      many(budgetStore, budget, setBudget, r.budgetLines ?? []),
      r.profile ? many(profileStore, invoiceProfile, setInvoiceProfile, [r.profile]) : Promise.resolve(true)
    ]);
    // Reopened lines that no longer make an expense / draw (Expense → Personal, a part removed).
    const gone = async <T extends { id: string }>(store: Store<T>, list: T[], set: (l: T[]) => void, ids: string[] = []) => {
      if (!ids.length) return;
      const drop = new Set(ids);
      const next = list.filter((x) => !drop.has(x.id));
      set(next);
      for (const id of ids) await store.remove(userId, id, next);
    };
    await gone(expenseStore, expenses.filter((e) => !r.expenses.some((x) => x.id === e.id)).concat(r.expenses), setExpenses, r.removeExpenses);
    await gone(drawStore, draws.filter((d) => !r.draws.some((x) => x.id === d.id)).concat(r.draws), setDraws, r.removeDraws);
    // The import history last, so a line only counts as imported once what it made is saved.
    const linesOk = await many(bankLineStore, bankLines, setBankLines, r.lines);
    if (r.update) {
      setStatus(`Updated ${r.lines.length} saved line${r.lines.length === 1 ? '' : 's'}${r.removeExpenses?.length ? `; ${r.removeExpenses.length} expense${r.removeExpenses.length > 1 ? 's' : ''} removed` : ''}.` + (oks.every(Boolean) && linesOk ? '' : ' Some saved on this device only.'));
      return;
    }
    const n = (route: string) => r.lines.filter((l) => l.route === route).length;
    setStatus(
      `Imported ${r.lines.length} lines: ${n('expense')} expenses, ${n('draw')} draws, ${n('income')} income${r.invoices.length ? ` (${r.invoices.length} invoice${r.invoices.length > 1 ? 's' : ''} marked paid)` : ''}, ${n('personal')} personal, ${n('transfer') + n('interest')} transfers / interest.` +
        (r.budgetLines?.length ? ` Budget updated: ${r.budgetLines.map((b) => b.description).join(', ')}.` : '') +
        (oks.every(Boolean) && linesOk ? '' : ' Some saved on this device only; they go to the cloud when the connection is back.')
    );
  }
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
        setStatus(`${taskName(t)}: taken back out of Expenses.`);
      }
    }
  }
  /** A linked task renamed or rescheduled: its budget line follows (name, repeat, date). */
  // Oct 28: a linked bill's Task is its kind (MM / EOM / ANN BILL…). When the rule for that changes,
  // bills already swapped (Description = the line item) take the new name by themselves.
  const relabeling = useRef(false);
  useEffect(() => {
    if (relabeling.current || !tasks.length || !budget.length) return;
    const fix = tasks.flatMap((t) => {
      const line = t.budgetLineId && !t.deletedAt && !t.parentId ? budget.find((l) => l.id === t.budgetLineId) : undefined;
      if (!line || t.description.trim() !== line.description.trim()) return [];
      const kind = billName(line);
      return kind === t.task ? [] : [{ ...t, task: kind }];
    });
    if (!fix.length) return;
    relabeling.current = true;
    void taskOps.saveMany(fix).finally(() => (relabeling.current = false));
  }, [tasks, budget]);

  /** Oct 28 · Push to Budget (task card): a budget line for the task, linked; the amount comes from Notes. */
  async function pushToBudget(t: Task) {
    const found = moneyIn(t.notes) ?? moneyIn(t.expense) ?? (t.expense.trim() && Number.isFinite(Number(t.expense)) ? { amount: Number(t.expense), currency: 'CAD' } : null);
    let amount: number | null = found && found.currency === 'CAD' ? found.amount : null;
    if (found && found.currency !== 'CAD') {
      try {
        amount = toCad(found.amount, await rateToCad(found.currency));
      } catch {
        amount = null;
      }
    }
    const proj = projects.find((x) => x.id === t.projectId);
    const section = sectionForTask(t);
    const line: BudgetLine = {
      ...newBudgetLine(section, budget.reduce((m, l) => Math.max(m, l.sort + 1), 0)),
      description: t.description.trim() || t.task.trim(),
      project: proj ? proj.name.replace(/^STARDVST\s+/i, '') : '',
      date: repeatOf(t).kind === 'none' ? t.endDate : null,
      repeat: writeRepeat(repeatOf(t)),
      amount,
      ...(found && found.currency !== 'CAD' ? { currency: found.currency, foreign: found.amount } : {}),
      notes: t.notes
    };
    await budgetOps.save(line);
    await taskOps.save(fromLine({ ...t, notes: t.notes }, line));
    setStatus(
      `${line.description} pushed to Budget (${section === 'planned' ? 'Planned' : section === 'annual' ? 'Annual' : 'Monthly fixed'})${amount !== null ? '.' : found ? `: couldn't get today's ${found.currency} rate, use ⋯ Recalc there.` : ': no amount in Notes (e.g. 1140 USD), add it in Budget.'}`
    );
  }

  async function lineFollowsTask(t: Task) {
    const line = t.budgetLineId ? budget.find((l) => l.id === t.budgetLineId) : undefined;
    if (!line || t.deletedAt) return;
    const rep = writeRepeat(repeatOf(t));
    const next: BudgetLine = { ...line, description: t.description.trim() || line.description, repeat: rep, date: rep ? line.date : t.endDate ?? line.date, link: t.link, linkLabel: t.linkLabel };
    if (next.description !== line.description || (next.repeat ?? null) !== (line.repeat ?? null) || next.date !== line.date || (next.link ?? '') !== (line.link ?? '') || (next.linkLabel ?? '') !== (line.linkLabel ?? '')) await budgetOps.save(next);
    // A new repeat can change the kind of bill (MM / EOM / ANN…).
    const kind = billName(next);
    if (kind !== t.task) await taskOps.save({ ...t, task: kind });
  }
  /**
   * V20-201 (Dan, Nov 14): a task with a launch keeps it in step: its name (while they match), date / time,
   * project and link go to the launch, and ticking the task done checks off today's run (asking the time
   * like any Done). Deleting the task leaves the launch.
   */
  function launchFollowsTasks(items: Task[]) {
    const before = tasksRef.current;
    const now = new Date();
    for (const t of items) {
      if (!t.launchId || t.deletedAt) continue;
      const old = before.find((x) => x.id === t.id);
      const l = launches.find((x) => x.id === t.launchId);
      if (!old || !l) continue;
      const next = launchFromTask(old, t, l);
      if (next) void saveLaunchEdit(next, true);
      const nowDone = isRecurring(t) ? doneToday(t, now) && !doneToday(old, now) : t.done && !old.done;
      const run = logFor(logRef.current, l, now);
      if (nowDone && l.active !== false && happensToday(next ?? l, now) && !run.finishedAt && run.outcome !== 'skipped' && run.outcome !== 'cleared' && !handled[runKey(l, now)]) {
        void finishLaunch(next ?? l, 'done');
      }
    }
  }
  /** V20-450 (Dan, Nov 21): a task added to the in-app calendar (beta) keeps its event in step: name and date follow
   *  the task; deleting the task takes it off the calendar. Linked through the task's googleEventId (the event's id). */
  function eventFollowsTasks(items: Task[]) {
    for (const t of items) {
      if (!t.googleEventId) continue;
      const ev = events.find((e) => e.id === t.googleEventId && !e.google);
      if (!ev) continue;
      if (t.deletedAt) {
        void eventOps.remove(ev.id);
        continue;
      }
      // Only a change to the task's date moves the event, keeping its length (an end date picked in Add event stays).
      const old = tasksRef.current.find((x) => x.id === t.id);
      const was = old ? old.endDate ?? old.startDate : null;
      const date = t.endDate ?? t.startDate ?? null;
      const title = taskName(t);
      let { startDate, endDate } = ev;
      if (was && date && was !== date) {
        const shift = Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${was}T12:00:00`)) / 864e5);
        const move = (d: string) => isoDate(new Date(Date.parse(`${d}T12:00:00`) + shift * 864e5));
        startDate = move(ev.startDate);
        endDate = move(ev.endDate);
      }
      if (ev.title !== title || startDate !== ev.startDate || endDate !== ev.endDate) void eventOps.save({ ...ev, title, startDate, endDate });
    }
  }
  /** V20-450 / V20-451 (Dan, Nov 21): ⋯ → Add to calendar in beta (no Google) opens Add event filled in from the task
   *  (its name, its Date required), like Create launch opens Add timed launch. Saving links the event to the task.
   *  A task already on the calendar opens its event to edit instead of making a second.
   *  V20-451c: it opens right where you are (Tasks stays open), not on the Launch Page. */
  const [taskEvent, setTaskEvent] = useState<{ event: CalEvent | null; id: string; title: string; date: string; taskId: string } | null>(null);
  function addTaskToAppCalendar(t: Task) {
    const date = t.endDate ?? t.startDate ?? isoDate(new Date());
    const existing = t.googleEventId ? events.find((e) => e.id === t.googleEventId && !e.google) : undefined;
    setTaskEvent({ event: existing ?? null, id: existing?.id ?? crypto.randomUUID(), title: taskName(t), date, taskId: t.id });
  }
  async function saveTaskEvent(e: CalEvent) {
    const link = taskEvent;
    await eventOps.save(e);
    if (link && !link.event) {
      const t = tasksRef.current.find((x) => x.id === link.taskId);
      if (t) await taskOps.save({ ...t, googleEventId: e.id });
    }
    setStatus(`${e.title} is on your calendar on ${new Date(`${e.startDate}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`);
    setTaskEvent(null);
  }
  const saveTask = async (t: Task) => {
    const old = tasksRef.current.find((x) => x.id === t.id);
    launchFollowsTasks([t]);
    eventFollowsTasks([t]);
    decisionsFollowTasks([t]);
    await taskOps.save(t);
    await payFor([t]);
    await lineFollowsTask(t);
    checkTaskClash(t, old);
  };
  /** SCHEDULE GUARDRAILS (Dan, Nov 17, V20-287): a task only counts once it's scheduled at a time, on its Date required.
   *  It holds an hour (same as Add to calendar). A task with a launch is checked as that launch; one with no time,
   *  a repeat, or done / deleted never counts. V20-288: timed tasks also count against each other and against launches. */
  const timedTask = (t: Task) => !!t.atTime && !!(t.endDate ?? t.startDate) && !t.launchId && !t.done && !t.deletedAt && !isRecurring(t);
  const taskStand = (t: Task) =>
    ({ id: `task:${t.id}`, title: taskName(t), atTime: t.atTime, minutes: 60, urls: [], projectId: t.projectId, logKind: 'productivity', repeat: 'once', onDate: t.endDate ?? t.startDate, weekdays: [], active: true }) as unknown as Launch;
  const taskStands = () => tasksRef.current.filter(timedTask).map(taskStand);
  function checkTaskClash(t: Task, old?: Task) {
    if (!timedTask(t)) return;
    if (old && timedTask(old) && old.atTime === t.atTime && (old.endDate ?? old.startDate) === (t.endDate ?? t.startDate)) return;
    checkClash(taskStand(t));
  }
  /** V20-288 (Dan, Nov 17): Add to that block for a task: it becomes a step in that launch, and gives up its own time
   *  (the block holds the time now), so the two can't double-book. Its dates stay. */
  async function addTaskToBlock(standId: string, block: Launch) {
    const t = tasksRef.current.find((y) => `task:${y.id}` === standId);
    if (!t) return;
    const name = taskName(t);
    const steps = block.steps ?? [];
    if (!steps.includes(name)) await launchOps.save({ ...block, steps: [...steps, name] });
    await taskOps.save({ ...t, atTime: null });
    setStatus(`${name} is now a step in ${block.title}.`);
  }
  const saveTasks = async (items: Task[]) => {
    launchFollowsTasks(items);
    eventFollowsTasks(items);
    decisionsFollowTasks(items);
    await taskOps.saveMany(items);
    await payFor(items);
  };

  /**
   * ONE PLAN = ONE TASK (Dan, Nov 19). A plan goes to Tasks as one task (the plan's name); each decision is a step
   * under it. They stay linked both ways: a step ticked marks its decision done (and back), a renamed step renames the
   * decision, a step's date is the decide-by date; a new decision becomes a new step. A plan is in Tasks once: sending
   * it again opens Tasks. Deleting either side only unlinks, nothing else is deleted.
   */
  const liveTask = (id: string | null | undefined) => (id ? tasksRef.current.find((t) => t.id === id && !t.deletedAt) : undefined);
  const nextTaskSort = () => tasksRef.current.reduce((m, t) => Math.max(m, t.sort), 0) + 1;
  function stepFor(d: Decision, parent: Task, existing: Task | undefined, sort: number): Task {
    const base: Task = existing ?? { ...newTask(sort, parent.projectId), status: 'PENDING' };
    const done = d.status === 'done';
    const picked = d.options.find((o) => o.picked);
    // The picked option goes in the step's notes, unless you've written notes of your own there.
    const ownNotes = base.notes.trim() && !base.notes.startsWith('Picked: ');
    return {
      ...base,
      parentId: parent.id,
      task: d.title.trim() || base.task,
      // V20-344: the step's date is its decision's decide-by (none: the task's date); it starts with the task.
      description: existing ? base.description : parent.description,
      startDate: existing ? base.startDate : parent.startDate,
      endDate: d.decideBy ?? (existing ? base.endDate : parent.endDate),
      done,
      doneAt: done ? base.doneAt ?? new Date().toISOString() : null,
      notes: ownNotes ? base.notes : picked ? `Picked: ${picked.name}` : ''
    };
  }
  const sameTask = (a: Task, b: Task) => JSON.stringify(a) === JSON.stringify(b);
  /** Planner › Add task (Dan, Nov 19): opens Add task filled in from the plan (its open decisions as steps) so you
   *  review it before it saves. On Save the plan and its decisions link to the new task and steps. Steps take the
   *  task's dates. A plan already in Tasks opens Tasks instead of making a second copy. */
  function planToTasks(plan: Plan) {
    const already = liveTask(plan.taskId);
    if (already) {
      setPage('tasks');
      setStatus(`${plan.name} is already in Tasks (${taskName(already)}).`);
      return;
    }
    const decs = decisions.filter((d) => d.planId === plan.id && d.status !== 'done' && d.title.trim()).sort(byDate);
    // V20-344: each step brings its decision's date, description (as notes) and the picked option's link.
    const lastDate = decs.map((d) => d.decideBy).filter((x): x is string => !!x).sort().pop() ?? null;
    const today = isoDate(new Date());
    setPage('launch');
    setTaskPreset({
      fill: { task: plan.name.trim(), description: plan.description.trim(), projectId: plan.projectId, startDate: plan.startDate ?? today, endDate: plan.decideBy ?? lastDate },
      n: Date.now(),
      seed: {
        steps: decs.map((d) => ({
          task: d.title.trim(),
          endDate: d.decideBy,
          link: d.options.find((o) => o.picked)?.link ?? '',
          atTime: null,
          notes: d.description.trim()
        })),
        onSaved: (t, kids) => {
          void planOps.save({ ...plan, taskId: t.id });
          const key = (x: string) => x.trim().toLowerCase();
          const linked = decs.flatMap((d) => {
            const k = kids.find((s) => key(s.task) === key(d.title));
            return k ? [{ ...d, taskId: k.id }] : [];
          });
          if (linked.length) void decisionOps.saveMany(linked);
          setStatus(`${plan.name} is in Tasks: ${kids.length} step${kids.length === 1 ? '' : 's'}.`);
        }
      }
    });
  }
  /** A decision saved in the Planner: its step follows (a new decision in a plan that's in Tasks gets a step). */
  async function saveDecision(d: Decision) {
    const plan = d.planId ? plans.find((x) => x.id === d.planId) : undefined;
    const parent = liveTask(plan?.taskId);
    if (!parent) return decisionOps.save(d);
    const existing = liveTask(d.taskId);
    const step = stepFor(d, parent, existing, nextTaskSort());
    if (!existing || !sameTask(step, existing)) await taskOps.save(step);
    await decisionOps.save(existing ? d : { ...d, taskId: step.id });
  }
  /** A plan saved: its task takes the new name / description / date. */
  async function savePlan(p: Plan) {
    await planOps.save(p);
    const t = liveTask(p.taskId);
    if (!t) return;
    const next = { ...t, task: p.name.trim() || t.task, description: p.description.trim(), endDate: p.decideBy ?? t.endDate };
    if (!sameTask(next, t)) await taskOps.save(next);
  }
  /** A step or plan task changed in Tasks: its decision / plan follows. Runs before the save (reads the old copy). */
  function decisionsFollowTasks(items: Task[]) {
    const before = tasksRef.current;
    const changedDecisions: Decision[] = [];
    for (const t of items) {
      const old = before.find((x) => x.id === t.id);
      if (!old || t.deletedAt) continue;
      const d = decisions.find((x) => x.taskId === t.id && x.planId && plans.find((p) => p.id === x.planId)?.taskId === t.parentId);
      if (d) {
        let n = d;
        if (t.done !== old.done) n = { ...n, status: t.done ? 'done' : d.options.some((o) => o.picked) ? 'decided' : 'open' };
        if (t.task.trim() && t.task !== old.task) n = { ...n, title: t.task.trim() };
        if ((t.endDate ?? null) !== (old.endDate ?? null)) n = { ...n, decideBy: t.endDate };
        if (n !== d) changedDecisions.push(n);
      }
      const plan = plans.find((p) => p.taskId === t.id);
      if (plan && t.task.trim() && t.task !== old.task) void planOps.save({ ...plan, name: t.task.trim() });
    }
    if (changedDecisions.length) void decisionOps.saveMany(changedDecisions);
  }
  /** A budget line saved: its linked task takes the shared fields (name, repeat / date, amount). */
  async function saveBudgetLine(l: BudgetLine) {
    await budgetOps.save(l);
    const linked = tasks.filter((t) => t.budgetLineId === l.id && !t.deletedAt);
    const changed = linked.map((t) => fromLine(t, l)).filter((t, i) => JSON.stringify(t) !== JSON.stringify(linked[i]));
    if (changed.length) await taskOps.saveMany(changed);
  }
  /** A budget line removed: its task stays, unlinked. */
  async function deleteBudgetLine(id: string) {
    await budgetOps.remove(id);
    const linked = tasks.filter((t) => t.budgetLineId === id);
    if (linked.length) await taskOps.saveMany(linked.map((t) => ({ ...t, budgetLineId: null })));
  }
  /** Link and dedupe (LP-030 step 3): one save for every task it touches. */
  async function applyLinks(plan: LinkPlan) {
    const items = [...plan.remove, ...plan.linked.map((x) => x.task), ...plan.created.map((x) => x.task)];
    await taskOps.saveMany(items);
    setStatus(`Linked ${plan.linked.length}, added ${plan.created.length} tasks, moved ${plan.remove.length} duplicates to Recently deleted.`);
  }
  /** An import: the budget becomes exactly this list. */
  async function replaceBudget(next: BudgetLine[]) {
    const old = budget;
    setBudget(next);
    const gone = old.filter((l) => !next.some((n) => n.id === l.id));
    for (const l of gone) await budgetStore.remove(userId, l.id, next);
    // V20-010: tasks linked to a line that's gone are unlinked (as ⋯ Remove does), not left pointing at nothing.
    const goneIds = new Set(gone.map((l) => l.id));
    const orphans = tasks.filter((t) => t.budgetLineId && goneIds.has(t.budgetLineId));
    if (orphans.length) await taskOps.saveMany(orphans.map((t) => ({ ...t, budgetLineId: null })));
    let ok = true;
    for (const l of next) ok = !!(await budgetStore.save(userId, l, next)) && ok;
    const unlinked = orphans.length ? ` ${orphans.length} task${orphans.length === 1 ? '' : 's'} unlinked from removed lines.` : '';
    setStatus((ok ? `Budget: ${next.length} lines saved.` : `Budget: ${next.length} lines saved on this device only.`) + unlinked);
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
  // V20-026: the newer copy a clashing journal save ran into (merged with ours, never swapped in blind).
  const journalTheirs = useRef(new Map<string, JournalEntry | null>());
  function saveJournal(e: JournalEntry) {
    const list = journalRef.current;
    const next = list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e];
    journalRef.current = next;
    setJournal(next);
    void journalStore.save(userId, e, next).then((how) => {
      // V20-026: a newer copy won (another device or tab). Its copy is on screen now; put our
      // writing back into it instead of dropping it, then save the merge.
      if (how !== 'newer') return;
      const cur = journalRef.current;
      const theirs = journalTheirs.current.get(e.id) ?? null;
      journalTheirs.current.delete(e.id);
      const merged = theirs ? mergeJournal(theirs, e) : e;
      const again = theirs ? cur.map((x) => (x.id === e.id ? merged : x)) : [...cur, e];
      journalRef.current = again;
      setJournal(again);
      void journalStore.save(userId, merged, again);
      setStatus('This entry was also changed on another device or tab. Both versions were kept in it.');
    });
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
  d26TodayRef.current = d26Today;
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
    tickDay(d26Today, key, on);
  }
  /** V12-043: mark a day as an off day (or back to a run day). Its ticks stay, in case it's undone. */
  function setOffDay(day: string, off: boolean) {
    const cur = daysRef.current.find((d) => d.day === day) ?? { id: dayId(day), day, mode: d26Mode, shift: d26Shift, ticks: [], items: snapshot(nonnegs), sort: 0 };
    saveDay({ ...cur, off });
    setStatus(off ? `${day}: off day. It counts nowhere, and today's timed launches stay quiet.` : `${day}: a run day again.`);
  }
  /** V12-044: tick on any routine day (a past day opened from the 7-day strip, or today). */
  function tickDay(day: string, key: string, on?: boolean) {
    const cur = daysRef.current.find((d) => d.day === day) ?? { id: dayId(day), day, mode: d26Mode, shift: d26Shift, ticks: [], items: snapshot(nonnegs), sort: 0 };
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
        title: taskName(t),
        date,
        time: t.atTime,
        details: [t.description, t.link].filter(Boolean).join('\n')
      });
      await taskOps.save({ ...t, googleEventId: id });
      const cal = knownCalendars().find((c) => c.id === calendarId)?.summary ?? 'your calendar';
      setStatus(`${taskName(t)} added to ${cal} on ${new Date(`${date}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`);
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
  // V20-265 (Dan, Nov 15): Project Planner › Add to workflow opens the calendar's Add event filled in (the decision
  // and its decide-by date). From there Push task opens Add task, and the task's rocket pushes a timed launch:
  // calendar › task › rocket, the same chain as everywhere else.
  const [eventPreset, setEventPreset] = useState<{ title: string; date: string; n: number; id?: string; edit?: CalEvent | null; fromTask?: boolean } | null>(null);
  function decisionToWorkflow(d: Decision) {
    // ONE PLAN = ONE TASK: a decision that's already a step goes to Tasks, not to a second copy via the calendar.
    const step = d.taskId ? tasksRef.current.find((t) => t.id === d.taskId && !t.deletedAt) : undefined;
    if (step) {
      const parent = step.parentId ? tasksRef.current.find((t) => t.id === step.parentId) : undefined;
      setPage('tasks');
      setStatus(`${d.title} is a step in ${parent ? taskName(parent) : 'a task'} in Tasks.`);
      return;
    }
    setPage('launch');
    setEventPreset({ title: d.title, date: d.decideBy ?? isoDate(new Date()), n: Date.now() });
  }

  function createLaunchFromTask(t: Task) {
    // V20-209 (Dan, Nov 14): its launch still exists: open it to edit instead of making a second one.
    const linked = t.launchId ? launches.find((l) => l.id === t.launchId) : null;
    if (linked) {
      setPage('launch');
      setEditLaunch(linked);
      return;
    }
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
        title: taskName(t),
        atTime: t.atTime ?? '09:30',
        repeat: monthly ? 'monthly' : weekly ? 'weekly' : 'once',
        weekdays: weekly ? rep.days : [],
        monthDay: monthly ? Number(rep.rule) : null,
        onDate: monthly || weekly ? null : (rep.kind !== 'none' ? nextRepeat(rep, new Date()) : null) ?? t.endDate ?? t.startDate ?? isoDate(firstBlock),
        urls: t.link ? [t.link] : [],
        // V20-074: a launch made from a task takes the task's project.
        projectId: t.projectId ?? null
      },
      n: Date.now(),
      // V20-347 (Dan, Nov 19): a task with steps: pick which of its open steps this block is for.
      stepPicks: tasksRef.current
        .filter((x) => x.parentId === t.id && !x.done && !x.deletedAt)
        .sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.sort - b.sort)
        .map((x) => ({ name: x.task.trim() || taskName(x), date: x.endDate })),
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
  // V12-043: on an off day, timed launches stay quiet (no reminder, no Missed pop-up).
  const offToday = !!d26Days.find((d) => d.day === d26Today)?.off;
  const missedNow = offToday ? [] : launches.filter((l) => isMissed(l, now) && stillOpen(l) && l.id !== pastAsk?.id);
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
    if (reminder || pastAsk || missedList.length || offToday) return;
    const due = launches.find(
      (l) => isDue(l, now) && !handled[runKey(l, now)] && !(snoozed[l.id] && snoozed[l.id] > now.getTime())
    );
    if (due) setReminder(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, reminder, pastAsk, snoozed, handled, missedList.length, offToday]);

  // Start alert: chime + desktop notification when a reminder pops.
  useEffect(() => {
    if (!reminder) return;
    if (reminder.sound !== false) chime('start', reminder.tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder?.id]);

  // End alarm: a launched launch whose time allotted has run out.
  useEffect(() => {
    if (timeUp || reminder || !logReady) return;
    const over = launches.find((l) => {
      const key = runKey(l, now);
      if (handled[key] !== 'launched' || endAlerted[key] || isPaused(l)) return false;
      // V20-063 (Nov 11): the clock runs from the later of the set time and when it was started, so a run
      // started late (▶ on a missed run, or late from Active) gets its full time instead of being up at once.
      // V20-184 (Nov 14): real timestamps, not minutes of the day, so a run that ends after midnight still
      // gets its Time's up (10:03 PM + 120 min never matched "24:03").
      let start = new Date(`${isoDate(launchDate(l, now))}T${timeFor(l, now)}:00`).getTime();
      const at = logFor(launchLog, l, now).launchedAt;
      if (at && new Date(at).getTime() > start) start = new Date(at).getTime();
      const end = start + (l.minutes + extraToday(l) + Math.round(pausedMin(l, now.getTime()))) * 60_000;
      return now.getTime() >= end;
    });
    if (!over) return;
    setEndAlerted((m) => ({ ...m, [runKey(over, now)]: true }));
    timeUpExtra.current = logFor(launchLog, over, now).extra;
    setTimeUp(over);
    if (over.sound !== false) chime('end', over.tone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, handled, endAlerted, launchLog, timeUp, reminder, paused, logReady]);

  /**
   * Oct 29 · Missed tab: settle a past run. Done = checked off without logging time (nothing goes to
   * 26 Days); cleared = taken out of the counts, kept in the log as 'cleared'.
   */
  function settleMissed(l: Launch, day: string, how: 'done' | 'cleared', logMin?: number | null, startAt?: string | null) {
    const list = logRef.current;
    // V20-073: Done from Missed or early from Scheduled asks Log the time?; its answer is kept on the run.
    const entered = how === 'done' && typeof logMin === 'number' && logMin > 0 ? Math.round(logMin) : null;
    const cur = list.find((g) => g.launchId === l.id && g.day === day);
    const at = new Date(`${day}T${l.atTime || '12:00'}:00`).toISOString();
    const item: LaunchLog = {
      ...(cur ?? { id: crypto.randomUUID(), launchId: l.id, day, planned: l.minutes, extra: 0, sort: 0, launchedAt: null }),
      title: l.title,
      projectId: l.projectId ?? null,
      outcome: how,
      // V20-268: an entered time with a Start runs from Start to Start + minutes.
      launchedAt: entered && startAt ? startAt : null,
      finishedAt: entered && startAt ? finishIso(startAt, entered) : at,
      routineDay: day,
      ...(how === 'done' ? { loggedMin: entered, timeSource: entered ? 'entered' : 'none' } : { loggedMin: null, timeSource: null })
    } as LaunchLog;
    const next = cur ? list.map((g) => (g.id === item.id ? item : g)) : [...list, item];
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.save(userId, item, next);
    if (how === 'done' && day === isoDate(new Date())) void completeTasksFor(l);
    if (entered) {
      void logFromLaunch(l, { minutes: entered, day, id: item.id }).then((logged) =>
        setStatus(`${l.title} (${day}): marked done${logged ? `, ${logged} logged` : `, ${entered} min logged`}.`)
      );
      return;
    }
    setStatus(how === 'done' ? `${l.title} (${day}): marked done, no time logged.` : `${l.title} (${day}): cleared, it won't count either way.`);
  }

  /** V20-216 (Dan, Nov 14): Stats › + adds a log by hand: work done with no launch (errands, a napkin sketch).
   *  It's a done run with no launch (time source 'manual'): counts in hours, project, What and Productivity,
   *  never in the Done rate. */
  async function addManualLog(x: { title: string; projectId: string | null; day: string; start: string; minutes: number }) {
    const minutes = Math.max(1, Math.round(x.minutes));
    const t0 = new Date(`${x.day}T${x.start}:00`);
    const item: LaunchLog = {
      id: crypto.randomUUID(),
      launchId: '',
      day: x.day,
      title: x.title,
      planned: minutes,
      extra: 0,
      outcome: 'done',
      launchedAt: t0.toISOString(),
      finishedAt: new Date(t0.getTime() + minutes * 60_000).toISOString(),
      sort: 0,
      loggedMin: minutes,
      timeSource: 'manual',
      projectId: x.projectId,
      routineDay: x.day,
      pausedMin: 0,
      pausedAt: null
    };
    const next = [...logRef.current, item];
    logRef.current = next;
    setLaunchLog(next);
    await launchLogStore.save(userId, item, next);
    // A stand-in launch for the Productivity log (V20-216 fix: it needs a time, or launchDate throws and the form hangs).
    const stand = { id: `manual:${item.id}`, title: x.title, atTime: x.start, minutes, urls: [], projectId: x.projectId, logKind: 'productivity', repeat: 'once', onDate: x.day, weekdays: [] } as unknown as Launch;
    let logged = '';
    try {
      logged = await logFromLaunch(stand, { minutes, day: x.day, id: item.id });
    } catch {
      /* the run is saved; Productivity just didn't log */
    }
    setStatus(`${x.title}: ${minutes} min logged${logged ? `, ${logged}` : ''}.`);
  }

  /** V20-270 (Dan, Nov 16): fix a run from Complete: its date, start and minutes. The run then reads
   *  start → start + minutes; changed time counts as entered (typed, not clocked). */
  function editRun(id: string, x: { day: string; start: string; minutes: number }) {
    const list = logRef.current;
    const g = list.find((r) => r.id === id);
    if (!g) return;
    const minutes = Math.max(1, Math.round(x.minutes));
    const t0 = new Date(`${x.day}T${x.start}:00`);
    const start = t0.toISOString();
    const same = g.launchedAt === start && g.loggedMin === minutes && (g.routineDay ?? g.day) === x.day;
    const item: LaunchLog = {
      ...g,
      // The run stays on its launch's day (one run per launch per day); the date it happened is its routine day (Stats).
      routineDay: x.day,
      launchedAt: start,
      finishedAt: new Date(t0.getTime() + minutes * 60_000).toISOString(),
      loggedMin: minutes,
      timeSource: same ? g.timeSource : g.timeSource === 'manual' ? 'manual' : 'entered',
      pausedMin: 0,
      pausedAt: null
    };
    const next = list.map((r) => (r.id === id ? item : r));
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.save(userId, item, next);
    setStatus(`${g.title}: fixed to ${x.day}, ${x.start}, ${minutes} min.`);
  }

  /** V20-282 (Dan, Nov 16): after a part log, the run still open counts on from where that part ended, so the
   *  next Log the time? (or the clock) doesn't count the same minutes twice. */
  function runFrom(id: string, at: string) {
    const list = logRef.current;
    const g = list.find((r) => r.id === id);
    if (!g || g.finishedAt) return;
    const item: LaunchLog = { ...g, launchedAt: at, pausedMin: 0, pausedAt: null };
    const next = list.map((r) => (r.id === id ? item : r));
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.save(userId, item, next);
  }

  /** V20-060 (Nov 11): undo a run from History. The log entry goes, so the run is back in Active
   * (today), Tomorrow, or Missed (a past day). Tasks it completed stay done. */
  function undoRun(id: string) {
    const list = logRef.current;
    const g = list.find((x) => x.id === id);
    if (!g) return;
    const next = list.filter((x) => x.id !== id);
    logRef.current = next;
    setLaunchLog(next);
    void launchLogStore.remove(userId, id, next);
    setHandled(unmarkHandled(`${g.launchId}:${g.day}`));
    setStatus(`${g.title} (${g.day}): undone, it's open again.`);
  }

  /**
   * Nov 4 (V20-027): a launch checked off Done completes its task: the one it was created from
   * (task.launchId), or a task with exactly the same name. Repeating tasks are done for this time
   * and come back on their next date; one-off tasks are done for good. Returns the names ticked.
   */
  async function completeTasksFor(l: Launch, when = new Date()): Promise<string[]> {
    const norm = (x: string) => x.toLowerCase().replace(/\s*[-·–—]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const list = tasksRef.current;
    const todo = list.filter(
      (t) =>
        !t.deletedAt &&
        (t.launchId === l.id || (!t.launchId && norm(taskName(t)) === norm(l.title))) &&
        (isRecurring(t) ? !doneToday(t, when) : !t.done)
    );
    if (!todo.length) return [];
    const at = when.toISOString();
    await saveTasks(todo.map((t) => (isRecurring(t) ? { ...t, doneAt: at } : { ...t, done: true, doneAt: at })));
    return todo.map(taskName);
  }

  async function finishLaunch(l: Launch, how: 'done' | 'skipped', logMin?: number | null, startAt?: string | null) {
    // V20-183 (Dan, Nov 14): every Done has a time. A Done that comes without one (the reminder, the Missed
    // pop-up, Time's up, a ritual) asks Log the time? when the run never ran on the clock or was left running.
    if (how === 'done' && logMin == null && !['h2o', 'food', 'vices'].includes(l.logKind ?? '')) {
      const r = logFor(logRef.current, l, new Date());
      const over = overrun(l);
      if (!r.launchedAt || over !== null) {
        if (reminder?.id === l.id) setReminder(null);
        // V20-276: left running: guess the real block (set time today if later than the auto-start, up to now).
        const guess = over !== null ? leftRunningGuess(r.launchedAt, runStart(l, new Date())) : null;
        setTimeAsk({
          l,
          minutes: guess ? guess.minutes : Math.min(480, (r.planned || l.minutes) + r.extra),
          start: guess?.start,
          q: over !== null ? `On the clock ${Math.floor(over / 60)}h ${over % 60}m. Log the time?` : 'Log the time?'
        });
        return;
      }
    }
    setHandled(markHandled(l, new Date(), how));
    // V20-073 (Nov 12): where a done run's time comes from. Started with ▶ or the rocket: timed (pauses out).
    // Not started or left running: the Log the time? prompt passes its minutes (entered). V20-183: always minutes.
    const run0 = logFor(logRef.current, l, new Date());
    let source: TimeSource | null = null;
    let mins: number | null = null;
    if (how === 'done') {
      // V20-178: a run left running past its time asks Log the time? too; its answer wins over the clock.
      // V20-183: no more 'none'; a timed run is at least 1 minute.
      if (typeof logMin === 'number' && logMin > 0) {
        source = 'entered';
        mins = Math.round(logMin);
      } else if (run0.launchedAt) {
        source = 'timed';
        mins = Math.max(1, Math.round((Date.now() - new Date(run0.launchedAt).getTime()) / 60_000 - pausedMin(l)));
      } else {
        // Only H2O / Food / Vice launches get here (fixed amounts; they don't ask).
        source = 'allotted';
        mins = (run0.planned || l.minutes) + run0.extra;
      }
    }
    // V12-003: a run checked off while paused closes its pause.
    const closed = pausedMin(l);
    // V20-268: an entered time with a Start saves the run from Start to Start + minutes.
    const span = source === 'entered' && mins && startAt ? { launchedAt: startAt, finishedAt: finishIso(startAt, mins), pausedMin: 0, pausedAt: null } : null;
    logLaunch(l, () => ({
      outcome: how,
      finishedAt: new Date().toISOString(),
      ...(run0.launchedAt ? { pausedMin: closed, pausedAt: null } : {}),
      ...(how === 'done' ? { loggedMin: mins, timeSource: source } : {}),
      ...(span ?? {})
    }));
    if (reminder?.id === l.id) setReminder(null);
    if (how === 'skipped') {
      if (l.repeat === 'hourly') return setStatus(`${l.title}: skipped this hour.`);
      // Skip today = same time tomorrow.
      const skipped = skipToTomorrow(l, new Date());
      await launchOps.save(skipped);
      checkClash(skipped);
      setStatus(`${l.title} moved to tomorrow, same time.`);
    } else {
      const ticked = tickNonNegsFor(l.title);
      const logged = await logFromLaunch(l, source === 'entered' && mins ? { minutes: mins } : undefined);
      const tasksDone = await completeTasksFor(l);
      const task = tasksDone.length ? ` Task done.` : '';
      if (ticked.length && !logged) return setStatus(`${l.title} checked off: ${ticked.join(', ')} ticked.${task}`);
      setStatus(logged ? `${l.title} checked off: ${logged} logged.${task}` : `${l.title} checked off.${task}`);
    }
  }

  /**
   * What a timed launch logs when checked off Done (26 Days). Set on the launch under "Logs":
   * Activity / Break use the time allotted, H2O / Food / Vice their fixed amount, Productivity
   * the time from Launch to Done (or the time allotted if there was nothing to open). Unset:
   * launches that open tabs or apps log Productivity by time spent; the rest log nothing.
   * Returns a short description of what was logged, or '' if nothing.
   */
  async function logFromLaunch(l: Launch, opts?: { minutes?: number; day?: string; id?: string }): Promise<string> {
    // V20-183 (Dan, Nov 14): PERSONAL is an ordinary What now; the project's Log Productivity switch decides.
    const kind = l.logKind ?? (l.urls.length && !l.ritualId ? 'productivity' : null);
    if (!kind) return '';
    // V20-181 (Dan, Nov 14): a project with Log Productivity off logs no Productivity blocks (its run keeps the time).
    const proj = l.projectId ? projects.find((p) => p.id === l.projectId) : null;
    if (kind === 'productivity' && proj && !logsProductivity(projects, proj)) return '';
    // Hourly launches log once an hour, so each gets its own line; others update today's line.
    const run = logFor(logRef.current, l, new Date());
    const id = opts?.id ?? (l.repeat === 'hourly' ? crypto.randomUUID() : run.id);
    const base = { id, day: opts?.day ?? d26Today, at: new Date().toISOString(), note: l.title, mode: d26Mode, sort: 0, qty: 1 };
    if (kind === 'productivity') {
      const allowed = (run.planned || l.minutes) + run.extra;
      // Launched or started: the time from then to Done (less any pause); checked off without starting: the time allotted.
      const spent = run.launchedAt ? (Date.now() - new Date(run.launchedAt).getTime()) / 60_000 - pausedMin(l) : allowed;
      // V20-073: minutes entered at the Log the time? prompt count as given.
      const blocks = opts?.minutes !== undefined ? Math.round((opts.minutes / 90) * 4) / 4 : Math.round((Math.min(spent, allowed) / 90) * 4) / 4;
      if (blocks <= 0) return '';
      await saveLog({ ...base, kind, amount: 1, qty: blocks, unit: 'blocks' });
      return `${blocks} block${blocks === 1 ? '' : 's'} of Productivity`;
    }
    // Activity and Break: started → the minutes actually spent (up to the time allotted + extra).
    const timed = () => {
      if (opts?.minutes !== undefined) return Math.max(1, Math.round(opts.minutes));
      if (!run.launchedAt) return l.minutes;
      const allowed = (run.planned || l.minutes) + run.extra;
      return Math.max(1, Math.round(Math.min((Date.now() - new Date(run.launchedAt).getTime()) / 60_000 - pausedMin(l), allowed)));
    };
    const entry: LogEntry =
      kind === 'activity'
        ? { ...base, kind, amount: timed(), unit: 'min' }
        : kind === 'rest'
          ? { ...base, kind, amount: timed(), unit: 'min' }
          : kind === 'h2o'
            ? { ...base, kind, amount: l.logAmount ?? 500, unit: 'ml', note: '' }
            : kind === 'food'
              ? { ...base, kind, amount: l.logAmount ?? 0, unit: 'kcal' }
              : { ...base, kind, amount: l.logAmount ?? 1, unit: 'load' };
    if (!(entry.amount > 0)) return '';
    await saveLog(entry);
    if (kind === 'activity' || kind === 'rest') return `${entry.amount} min of ${kind === 'activity' ? 'Activity' : 'Break'}`;
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
    setStatus(blocked ? BLOCKED_HELP : opensSomething(l) ? `Launched ${l.title}.` : `Started ${l.title}: the clock is running.`);
  }

  async function handleDeleteRoutine(id: string) {
    const gone = routines.find((x) => x.id === id);
    const next = routines.filter((x) => x.id !== id);
    setRoutines(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    await deleteRoutine(userId, id, next);
    setStatus(gone ? `${gone.name} deleted.` : 'Deleted.');
  }

  // V20-172: Settings sends only what changed; it's applied onto the latest copy and only those columns are written.
  async function handleSave(patch: Partial<BrandSettings>) {
    const prev = settingsRef.current;
    const next = applySettingsPatch(prev, patch);
    settingsRef.current = next;
    setSettings(next);
    const { synced } = await saveSettingsPatch(userId, prev, next, patch);
    const linkErr = await syncLinkedEmail(userId, next.account);
    setStatus(linkErr ?? (synced ? 'Settings saved and synced.' : 'Settings saved on this device.'));
  }

  // V20-210: the shared What list for every form this render.
  setWhatList(settings.whats);
  /** V20-210: add a What to the shared list (name in capitals, default time 60), or rename / retime / remove one. */
  async function saveWhats(next: { name: string; minutes: number }[]) {
    await handleSave({ whats: next });
  }
  const light = LIGHT_BACKGROUNDS.includes(settings.background);
  // Night mode (dark backgrounds) and day mode (light backgrounds) each have their own four colours.
  // V20-048 (Dan, Nov 11): day mode uses its colours exactly as picked (no deepening), so the same
  // codes look the same in both modes.
  const teal = light ? settings.dayTeal : settings.accentTeal;
  const surf = settings.surfaces[light ? 'day' : 'night'];
  const theme = {
    '--accent-purple': light ? settings.dayPurple : settings.accentPurple,
    '--accent-teal': teal,
    '--accent-green': light ? settings.dayGreen : settings.accentGreen,
    '--accent-pink': light ? settings.dayPink : settings.accentPink,
    // V20-144: Neutral (main colour 1) is the mode's text colour.
    '--beige': light ? settings.dayNeutral : settings.nightNeutral,
    // V20-146: CARDS + HEADER, the mode's header and card colours at their see-through level.
    '--header-bg': `color-mix(in srgb, ${surf.header} ${surf.headerSolid}%, transparent)`,
    '--card-surface': `color-mix(in srgb, ${surf.card} ${surf.cardSolid}%, transparent)`,
    '--card-solid': surf.card,
    // V20-059: the dropdown arrow is drawn in the picked teal (a picture can't read a CSS colour by itself).
    '--select-caret': `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${teal}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>`
    )}")`
  } as CSSProperties;

  // V20-129: the background shown: a tile, a colour, or your own image in a tile's slot (its default if it's gone).
  const shown = resolveBackground(settings.background, bgSlots);
  const bgImage = shown.image;
  if (bgImage) (theme as Record<string, string>)['--bg-image'] = `url("${bgImage}")`;
  (theme as Record<string, string>)['--bg-colour'] = light ? settings.dayColour : settings.nightColour;
  if (switchingAccount) return <main className="signin signin-light" aria-busy="true" />;
  const bootUser = session?.user.id ?? null;
  const bootReady = bootGaveUp || !supabase || !session || (settingsLoaded && bgFor === bootUser && coreFor === bootUser && planFor === bootUser);
  if (session && !bootReady) {
    let tone = 'dark';
    try {
      tone = localStorage.getItem('lp.lastTone') ?? 'dark';
    } catch {
      /* ignore */
    }
    return <div className="boot-blank" data-tone={tone} aria-busy="true" />;
  }
  if (session && settingsLoaded) {
    try {
      localStorage.setItem('lp.lastTone', light ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
  }
  if (!authReady) return <div className="app" style={theme} data-bg={bgImage ? 'image' : shown.tile} data-tone={light ? 'light' : 'dark'} />;
  if (supabase && !session) {
    return (
      <div className="app app-light" style={theme}>
        {/* V20-294 (Dan, Nov 17): Welcome first; SIGN IN / SIGN UP open the sign-in page. */}
        {signedOut === 'welcome' ? (
          <Welcome onSignIn={() => setSignedOut('signin')} onTour={(n) => { setTourAt(n); setSignedOut('tour'); }} onRequest={() => setSignedOut('signup')} />
        ) : signedOut === 'tour' ? (
          <Tour start={tourAt} onWelcome={() => setSignedOut('welcome')} onSignUp={() => setSignedOut('signup')} />
        ) : (
          <SignIn key={signedOut} signUp={signedOut === 'signup'} notice={signedOut === 'signin' ? linkError : null} onBack={() => setSignedOut('welcome')} />
        )}
      </div>
    );
  }

  // V20-435: wait (blank) for the password answer before anything else.
  if (session && supabase && pwCheckedFor !== session.user.id && !pwKnown(session.user.id)) return <main className="signin signin-light" aria-busy="true" />;
  // V20-430: set a password first.
  if (session && supabase && (recovering || (needsPassword && !pwLater))) {
    return (
      <div className="app app-light" style={theme}>
        <FirstPassword
          email={session.user.email ?? null}
          reset={recovering}
          onLater={() => {
            setRecovering(false);
            try {
              sessionStorage.setItem('lp.pwLater', '1');
            } catch {
              /* ignore */
            }
            setPwLater(true);
          }}
          onSave={async (password) => {
            const { error } = await supabase!.auth.updateUser({ password, data: { pw_set: true } });
            if (error) return error.message;
            setNeedsPassword(false);
            setRecovering(false);
            try {
              localStorage.setItem(pwKnownKey(session.user.id), '1');
            } catch {
              /* ignore */
            }
            return null;
          }}
        />
      </div>
    );
  }

  // V20-308 (Dan, Nov 17): first-run setup before the Launch Page, once settings have loaded.
  // V20-453: the Books track skips the launch setup (its own walkthrough comes next).
  if (session && settingsLoaded && !books && setupStepFor(settings.account)) {
    return (
      <BetaContext.Provider value={beta}>
      <div className="app app-light" style={theme}>
        <Setup
          settings={settings}
          email={session.user.email ?? ''}
          projects={projects}
          onSave={handleSave}
          onSignOut={() => void signOutClean()}
          onSaveRoutine={handleSaveRoutine}
          onSaveRocket={async (r) => void (await rocketOps.save(r))}
          onSaveLaunch={async (l) => void (await launchOps.save(l))}
          onSaveProject={async (p) => void (await projectOps.save(p))}
          onTest={(l) => setReminder(l)}
          onCancel={() => {
            // V20-376: set up before (or age checked) = close setup, back to the Launch Page; a brand-new account
            // that hasn't passed step 1 signs out and resumes here next time.
            const a = settings.account;
            resetSetupClock();
            if (a.setupDoneAt || a.birthday.trim()) void handleSave({ account: { ...a, setup: 'done' } as BrandSettings['account'] });
            else void signOutClean();
          }}
        />
      </div>
      </BetaContext.Provider>
    );
  }

  // ⚙ menu (and the hidden Import tasks picker): in the full header, and alone in KNOWLEDGE!B4SE's slim bar.
  const gear = (
    <>
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
        {/* V20-245: the header search (not on KNOWLEDGE!B4SE, which has its own). */}
        {page !== 'kb' &&
          (searchOpen || headerQ ? (
            <span className="search-box search-pill header-search">
              <input
                autoFocus
                type="search"
                value={headerQ}
                placeholder={page === 'tasks' ? 'Search tasks' : page === 'budget' ? 'Search the budget' : page === 'invoices' ? 'Search records' : 'Search launches, tasks, rockets'}
                aria-label="Search"
                onChange={(e) => setHeaderQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setHeaderQ('');
                    setSearchOpen(false);
                  }
                }}
              />
              <button type="button" className="icon-btn tool-btn is-key" aria-label="Close search" title="Close search" onClick={() => { setHeaderQ(''); setSearchOpen(false); }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d={headerQ ? 'M6 6l12 12M18 6L6 18' : 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.3-4.3'} /></svg>
              </button>
            </span>
          ) : (
            <button type="button" className="icon-btn tool-btn is-key header-search-btn" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.3-4.3" /></svg>
            </button>
          ))}
        {/* V20-111 (Dan, Nov 12): the ⚙ opens the Settings window straight away (no drop-down). */}
        <button type="button" className="icon-btn tool-btn gear-btn" aria-label="Settings" title="Settings" onClick={() => setSettingsOpen('account')}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
    </>
  );
  // KNOWLEDGE!B4SE (Nov 6, Dan): a white page of its own, whatever the theme, with a slim header.
  const kb = page === 'kb';
  const shellStyle = kb
    ? ({ ...theme, '--accent-teal': '#0DAEAA', '--accent-purple': '#6A4FA3', '--accent-pink': '#C2338F' } as CSSProperties)
    : theme;

  return (
    <BetaContext.Provider value={beta}>
    <BooksContext.Provider value={books}>
    <HeaderSearchContext.Provider value={{ q: headerQ, setQ: setHeaderQ }}>
    <MeditationsContext.Provider value={{ list: meditations, save: saveMeditation, remove: removeMeditation }}>
    <HiddenPicksContext.Provider value={{ hidden: hiddenPicks, hide: hidePick }}>
    <div
      className={`${scrolled ? 'app is-scrolled' : 'app'}${bgImage && !kb ? ' has-bg-image' : ''}${kb ? ' is-kb' : ''}`}
      style={shellStyle}
      data-bg={bgImage ? 'image' : shown.tile}
      data-tone={light || kb ? 'light' : 'dark'}
      data-scroll={scrollMode}
    >
      <div className="sky" aria-hidden="true">
        <div className="sky-stars" />
        <div className="sky-lines" />
        <div className="sky-horizon" />
        <div className="sky-floor" />
        <div className="sky-damascus" />
        <div className="sky-snow" />
      </div>
      <Header
        settings={settings}
        hidden={settingsLoaded ? hiddenPages : []}
        slim={kb}
        page={page}
        onPage={(pg) => {
          // V20-249: a greyed-out (switched off) page opens Settings › Modules instead.
          if (hiddenPages.includes(pg)) return setSettingsOpen('modules');
          setFocusTask(null);
          setPage(pg);
        }}
        right={
          kb ? (
            gear
          ) : (
          <>
            <div className="topbar-controls">
            {gear}
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
          )
        }
      />
      <div className="frame">
        {(routineProblem || storeProblem) && (
          <p className="notice" role="status">
            {routineProblem ?? storeProblem}
          </p>
        )}
        <main aria-label={page === 'launch' ? 'L4UNCH P4GE' : 'Page'}>
          {page === 'launch' ? (
            <LaunchPageHome
              rockets={!mods.rockets ? null : 
                <RocketsPanel
                  rituals={routines.filter((r) => r.kind === 'ritual').map((r) => ({ id: r.id, name: r.name }))}
                  projects={projects}
                  routineName={activeRoutine ? routineLabel(activeRoutine, shift) : null}
                  rockets={rocketsFor(rockets, activeRoutine?.id ?? null).filter((r) => matchesSearch(headerQ, r.name, ...(r.urls?.length ? r.urls : [r.url])))}
                  routineId={activeRoutine?.id ?? null}
                  launches={headerQ ? launches.filter((l) => matchesSearch(headerQ, l.title)) : launches}
                  onSaveRocket={rocketOps.save}
                  onSaveRockets={rocketOps.saveMany}
                  onDeleteRocket={rocketOps.remove}
                  onSaveLaunch={(l) => saveLaunchEdit(l)}
                  onDeleteLaunch={deleteLaunch}
                  onStatus={setStatus}
                  handled={handled}
                  today={now}
                  onFinish={finishLaunch}
                  onLaunchNow={launchNow}
                  isPaused={isPaused}
                  overrun={overrun}
                  onPause={togglePause}
                  log={headerQ ? launchLog.filter((g) => matchesSearch(headerQ, g.title)) : launchLog}
                  onSettleMissed={settleMissed}
                  onAddLog={addManualLog}
                  onUndoRun={undoRun}
                  onEditRun={editRun}
                  onRunFrom={runFrom}
                  offDays={d26Days.filter((d) => d.off).map((d) => d.day)}
                  baseline={d26Days
                    .filter((r) => r.day < d26Today && r.items.length && !r.off)
                    .map((r) => ({ day: r.day, on: scoreDay(r, d26Logs, d26Config).on }))}
                  offToday={offToday}
                  preset={timedPreset}
                  onPresetUsed={() => setTimedPreset(null)}
                  editLaunch={editLaunch}
                  onEditOpened={() => setEditLaunch(null)}
                />
              }
              week={!mods.week ? null : 
                <WeekCalendar
                  addPreset={eventPreset}
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
                    const byId = e.google ? live.find((t) => t.googleEventId === e.google!.id) : live.find((t) => t.googleEventId === e.id);
                    const name = e.title.trim().toLowerCase();
                    const byName = live.find((t) => t.task.trim().toLowerCase() === name && (!t.endDate || (t.endDate >= e.startDate && t.endDate <= e.endDate) || t.startDate === e.startDate));
                    return (byId ?? byName)?.id ?? null;
                  }}
                  onOpenTask={(id) => {
                    setFocusTask(id);
                    setPage('tasks');
                  }}
                  onAddTask={(e) => setTaskPreset({ fill: { task: e.title, startDate: e.startDate, endDate: e.endDate }, n: Date.now() })}
                />
              }
              tasks={!mods.tasks ? null : 
                <TasksPanel
                  addPreset={taskPreset}
                  onAddPresetUsed={() => setTaskPreset(null)}
                  tasks={headerQ ? shownTasks.filter((t) => matchesSearch(headerQ, t.description, t.notes)) : shownTasks}
                  onPushToBudget={mods.budget ? pushToBudget : undefined}
                  projects={projects}
                  today={now}
                  onSave={saveTask}
                  onDelete={taskOps.remove}
                  onSaveMany={saveTasks}
                  onAddToCalendar={beta ? addTaskToAppCalendar : addTaskToCalendar}
                  onCreateLaunch={createLaunchFromTask}
                  hasLaunch={(id) => launches.some((l) => l.id === id)}
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
              cashbook={
                !books ? null : (
                  <CashBookCard
                    expenses={expenses}
                    lines={bankLines}
                    cashBook={settings.account.cashBook}
                    month={booksMonth}
                    onMonth={setBooksMonth}
                    onSetOpening={(start, opening) => void handleSave({ account: { ...settings.account, cashBook: { start, opening } } as BrandSettings['account'] })}
                    onDownloadBlank={() => downloadBlob('LAUNCH-SHEET-blank.xlsx', blankBooksFile({ purple: settings.accentPurple || '#8869cb', teal: settings.accentTeal || '#06f9c2' }))}
                    onImportFile={(f) => void importBooksFile(f)}
                    onExport={() =>
                      downloadBlob(
                        `${exportBrand()}-LAUNCH-SHEET-${new Date().toLocaleDateString('en-CA')}.xlsx`,
                        launchSheetFile({ lines: bankLines, expenses, draws, accounts: bankAccounts, budget, common, invoices }, { purple: settings.accentPurple || '#8869cb', teal: settings.accentTeal || '#06f9c2' })
                      )
                    }
                    onImportBank={() => {
                      presetRecordsView('income', books ? booksMonth : undefined);
                      setPage('invoices');
                      setTimeout(() => window.dispatchEvent(new Event('records:import')), 250);
                    }}
                  />
                )
              }
              expenses={
                !books ? null : (
                  <ExpensesCard
                    expenses={expenses}
                    today={booksDay}
                    onOpenAll={() => {
                      presetRecordsView('expenses', books ? booksMonth : undefined);
                      setPage('invoices');
                    }}
                    onAdd={() => {
                      presetRecordsView('expenses', books ? booksMonth : undefined);
                      setPage('invoices');
                      setTimeout(() => window.dispatchEvent(new Event('records:add')), 250);
                    }}
                  />
                )
              }
              income={
                !books ? null : (
                  <IncomeCard
                    lines={bankLines}
                    today={booksDay}
                    onOpenAll={() => {
                      presetRecordsView('income', books ? booksMonth : undefined);
                      setPage('invoices');
                    }}
                    onImport={() => {
                      presetRecordsView('income', books ? booksMonth : undefined);
                      setPage('invoices');
                      setTimeout(() => window.dispatchEvent(new Event('records:import')), 250);
                    }}
                  />
                )
              }
              budget={!mods.budget ? null : <BudgetCard lines={budget} today={now} onOpenAll={() => setPage('budget')} onOpenLine={(id) => { setBudgetOpen(id); setPage('budget'); }} onAdd={() => { setBudgetOpen('new'); setPage('budget'); }} projects={projects} />}
              planner={!mods.planner ? null : <PlannerPanel decisions={decisions} plans={plans} projects={projects} onSave={saveDecision} onSaveMany={decisionOps.saveMany} onSavePlan={savePlan} onPlanToTasks={planToTasks} onRemove={decisionOps.remove} onToWorkflow={decisionToWorkflow} onToggle={() => setPage('planner')} />}
              journal={!mods.journal ? null : <JournalPanel entries={journal} today={now} day={journalDay} onSave={saveJournal} onDelete={deleteJournal} onImport={importJournal} onOpen={() => setPage('journal')} />}
              today={!mods.routine ? null : 
                <TodayPanel
                  follow
                  routine={activeRoutine}
                  shift={shift}
                  onEdit={() => setEditor({ open: true, routine: activeRoutine })}
                />
              }
            />
          ) : page === 'tasks' ? (
            <TasksPage
              tasks={shownTasks}
                  onPushToBudget={mods.budget ? pushToBudget : undefined}
              projects={projects}
              today={now}
              onSave={saveTask}
              onDelete={taskOps.remove}
                  onSaveMany={saveTasks}
                  onAddToCalendar={beta ? addTaskToAppCalendar : addTaskToCalendar}
                  onCreateLaunch={createLaunchFromTask}
                  hasLaunch={(id) => launches.some((l) => l.id === id)}
              onOpenProjects={() => setSettingsOpen('projects')}
              onClose={() => {
                returnTo.current = 'h-tasks';
                setPage('launch');
              }}
              focusId={focusTask}
              editId={editTask}
              onEditOpened={() => setEditTask(null)}
              expenses={expenses}
            />
          ) : page === 'planner' ? (
            <PlannerPanel full decisions={decisions} plans={plans} projects={projects} onSave={saveDecision} onSaveMany={decisionOps.saveMany} onSavePlan={savePlan} onPlanToTasks={planToTasks} onRemove={decisionOps.remove} onToWorkflow={decisionToWorkflow} onToggle={() => {
              // V20-257 (Dan, Nov 15): ^ comes back to the Project Planner card, not the top of the page.
              returnTo.current = 'h-planner';
              setPage('launch');
            }} />
          ) : page === 'journal' ? (
            <JournalPanel entries={journal} today={now} day={journalDay} onSave={saveJournal} onDelete={deleteJournal} onImport={importJournal} full onClose={() => setPage('launch')} />
          ) : page === 'days26' ? (
            <Days26Page
              show={{ nonneg: mods.d26Nonneg, logging: mods.d26Logging, rituals: mods.d26Rituals, summary: mods.d26Summary }}
              now={now}
              displayName={shownName(settings)}
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
              rockets={rocketOptions(rockets, beta)}
              onAddRocket={async (url) => {
                await rocketOps.save({ id: crypto.randomUUID(), name: nameFromUrl(url), note: '', url, color: 'teal', routineIds: activeRoutine ? [activeRoutine.id] : null, sort: rockets.length });
              }}
              onTick={tickToday}
              onTickDay={tickDay}
              onSetOff={setOffDay}
              checkinText={checkinText}
              onCheckin={setCheckin}
            />
          ) : page === 'invoices' ? (
            <RecordsPage
              showInvoices={mods.invoice}
              showBooks={booksOn(mods)}
              showViews={{ expenses: mods.recExpenses, income: mods.recIncome, draws: mods.recDraws }}
              expenses={expenses}
              lines={budget}
              onSaveExpense={editExpense}
              onDeleteExpense={removeExpense}
              draws={draws}
              bankAccounts={bankAccounts}
              bankLines={bankLines}
              common={common}
              onSaveDraw={drawOps.save}
              onDeleteDraw={drawOps.remove}
              onImport={saveImport}
              onSaveBankLine={bankLineOps.save}
              projects={projects}
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
          ) : page === 'kb' ? (
            <KnowledgeBasePage userId={userId} onStatus={setStatus} />
          ) : page === 'budget' ? (
            <BudgetPage
              lines={budget}
              projects={projects}
              onSave={saveBudgetLine}
              onDelete={deleteBudgetLine}
              onReplace={replaceBudget}
              tasks={tasks}
              onApplyLinks={applyLinks}
              expenses={expenses}
              openId={budgetOpen}
              onOpened={() => setBudgetOpen(null)}
              onClose={() => {
                returnTo.current = 'h-budget-card';
                setPage('launch');
              }}
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
              onSaveTask={saveTask}
              onSaveTasks={saveTasks}
              onGoToTask={(id) => {
                setFocusTask(id);
                setPage('tasks');
              }}
            />
          ) : (
            <ComingSoon page={page} />
          )}
        </main>
        <footer className="toolbar">
          <img className="toolbar-logo" src="/launchpage-logo.png" alt="LaunchPage" />
          {/* V20-176 (Dan, Nov 13): the logo alone, centred; a message only shows while there is one. */}
          <p className="toolbar-status" role="status">
            {/* V20-189 (Dan, Nov 14): no "last action" line under the logo; only the device-only warning shows. */}
            {supabase ? '' : 'Running on this device only. Add Supabase keys to sync.'}
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
      {/* V20-451c: Add event for a task, over whatever page you're on. */}
      <Sheet open={!!taskEvent} title={taskEvent?.event ? 'Edit event' : 'Add event'} onClose={() => setTaskEvent(null)}>
        {taskEvent && (
          <EventForm
            key={taskEvent.id}
            event={taskEvent.event}
            date={taskEvent.date}
            title={taskEvent.title}
            newId={taskEvent.id}
            googleOn={false}
            onCancel={() => setTaskEvent(null)}
            onSave={(e) => saveTaskEvent(e)}
            onDelete={async (e) => {
              await eventOps.remove(e.id);
              setTaskEvent(null);
            }}
          />
        )}
      </Sheet>
      <ClashSheet
        clash={appClash}
        launches={[...launches, ...taskStands()]}
        onAddToBlock={addTaskToBlock}
        saved
        onSave={async (x) => {
          // V20-287: a task's stand-in (task:<id>) moves the task itself.
          if (x.id.startsWith('task:')) {
            const t = tasksRef.current.find((y) => `task:${y.id}` === x.id);
            if (t) await taskOps.save({ ...t, atTime: x.atTime });
            return;
          }
          await saveLaunchEdit(x);
        }}
        onDelete={(id) => deleteLaunch(id)}
        onClose={() => setAppClash(null)}
      />
      <Sheet open={!!pastAsk} title={pastAsk?.title ?? 'Already started?'} onClose={() => answerPast('not')}>
        {pastAsk && (
          <div className="timed-logask-sheet">
            {/* CP-036 (Dan, Nov 18): "[time] has passed." with LOG and START NOW (starts the block now, opens its rockets). */}
            <p className="logask-q">{`${clock12(timeFor(pastAsk, new Date()))} has passed.`}</p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-quiet" onClick={() => answerPast('done')}>
                Log
              </button>
              <button type="button" className="btn" onClick={() => answerPast('now')}>
                Start now
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={!!timeAsk} title={timeAsk?.l.title ?? 'Log the time?'} onClose={() => setTimeAsk(null)}>
        {timeAsk && (
          <form
            className="timed-logask-sheet"
            onSubmit={(e) => {
              e.preventDefault();
              const a = timeAsk;
              setTimeAsk(null);
              const m = Math.max(1, a.minutes);
              void finishLaunch(a.l, 'done', m, startIso(a.start ?? defaultStart(m), m));
            }}
          >
            <p className="logask-q">{timeAsk.q}</p>
            <label className="logask-min">
              <input
                type="number"
                min={1}
                max={480}
                required
                autoFocus
                value={timeAsk.minutes}
                aria-label="Minutes to log"
                onChange={(e) => setTimeAsk((a) => (a ? { ...a, minutes: Math.min(480, Math.max(1, Number(e.target.value) || 1)) } : a))}
              />
              <span>min</span>
            </label>
            {/* V20-268: when the work started (now − minutes until changed). */}
            <label className="logask-min logask-start">
              <span>Start</span>
              <input
                type="time"
                required
                value={timeAsk.start ?? defaultStart(timeAsk.minutes)}
                aria-label="Start time"
                onChange={(e) => setTimeAsk((a) => (a ? { ...a, start: e.target.value || undefined } : a))}
              />
            </label>
            <div className="sheet-actions">
              <button type="button" className="btn btn-quiet" onClick={() => setTimeAsk(null)}>
                Cancel
              </button>
              <button type="submit" className="btn">
                Log
              </button>
            </div>
          </form>
        )}
      </Sheet>
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
      {/* V20-446 (Dan, Nov 20): beta feedback: the flag any time, and "How was setup?" once after a tester's first setup. */}
      {session && beta && <FeedbackFlag page={page} />}
      {session && beta && !books && !isAdmin && settings.account.setupDoneAt && !settings.account.setupFeedbackAt && (
        <SetupFeedback
          setupSeconds={settings.account.setupSeconds ?? null}
          onDone={() => void handleSave({ account: { ...settings.account, setupFeedbackAt: new Date().toISOString() } as BrandSettings['account'] })}
        />
      )}
      <SettingsPanel
        admin={isAdmin}
        beta={beta}
        lpMode={lpMode}
        onLpMode={setLpMode}
        open={!!settingsOpen}
        bgSlots={bgSlots}
        onBgImage={async (mode, slot, image) => {
          setBgSlots((b) => ({ ...b, [mode]: b[mode].map((x, i) => (i === slot ? image : x)) }));
          const ok = await saveBgImage(userId, mode, slot, image);
          setStatus(ok ? (image ? 'Background image saved.' : 'Background image removed; the default is back.') : 'Background image kept on this device only.');
        }}
        tab={settingsOpen || 'account'}
        onTab={setSettingsOpen}
        email={session?.user.email ?? null}
        projects={
          <ProjectsManager
            projects={projects}
            calendars={knownCalendars()}
            onSave={projectOps.save}
            onDelete={deleteProject}
            tasks={tasks}
            launches={launches}
            runs={launchLog}
            whats={whatList()}
            onSaveWhats={saveWhats}
            onEditLaunch={(l) => {
              setSettingsOpen(false);
              setPage('launch');
              setEditLaunch(l);
            }}
            onEditTask={(t) => {
              setSettingsOpen(false);
              setFocusTask(t.id);
              setEditTask(t.id);
              setPage('tasks');
            }}
          />
        }
        onSignOut={supabase && session ? () => void signOutClean() : undefined}
        data={[
          // V20-198 (Dan, Nov 14): Data Management lists every export and import, whatever page it's opened from.
          // An import opens its page first, so you see where the data went. Rows for modules switched off stay hidden.
          {
            group: 'Export',
            label: 'Export my data',
            hint: 'Downloads the Launch Sheet: one .xlsx with a tab for every card.',
            button: 'Export',
            onClick: async () => {
              // V12-042: the Launch Sheet, one tab per card (Google events from this device's cache).
              const googleEvents = await loadCached(userId).catch(() => [] as CalEvent[]);
              const counts = downloadLaunchSheet({
                settings, routines, meditations, rockets, launches, launchLog, events, googleEvents, tasks, projects, journal,
                days: d26Days, nonnegs, logs: d26Logs, quotes, config: d26Config, budget
              });
              setStatus(`Launch Sheet exported: ${counts.length + 1} tabs, ${counts.reduce((a, c) => a + c.rows, 0)} rows.`);
            }
          },
          ...(booksOn(mods) || mods.invoice
            ? [
                {
                  group: 'Export',
                  label: 'Export records',
                  hint: 'Expenses, Income, Draws and Invoices: one .xlsx with a tab each.',
                  button: 'Export',
                  onClick: () =>
                    void downloadRecords({
                      business: exportBrand(),
                      expenses, draws, invoices, customers,
                      lines: bankLines, accounts: bankAccounts,
                      colors: { purple: settings.accentPurple || '#8869cb', teal: settings.accentTeal || '#06f9c2' }
                    })
                }
              ]
            : []),
          ...(mods.budget
            ? [
                {
                  group: 'Export',
                  label: 'Export budget (CSV)',
                  hint: 'The budget only. Opens in Google Sheets and imports back in.',
                  button: 'Export',
                  onClick: () => {
                    // V20-199: named like the Launch Sheet and Records exports (STARDVST-LTD-BUDGET-2026-11-14.csv).
                    if (budget.length) downloadText(`${exportBrand()}-BUDGET-${isoDate(new Date())}.csv`, linesToCsv(budget), 'text/csv');
                  }
                }
              ]
            : []),
          {
            group: 'Import',
            label: 'Import tasks',
            hint: 'Adds tasks from a Launch Sheet export or a tasks CSV. Rows already in your list are skipped.',
            button: 'Import',
            onClick: () => {
              setSettingsOpen(false);
              importInput.current?.click();
            }
          },
          ...(mods.budget
            ? [
                {
                  group: 'Import',
                  label: 'Import budget',
                  hint: 'The BUDGET tab of the Launch Sheet (CSV) or a JSON file. Opens Budget first.',
                  button: 'Import',
                  onClick: () => {
                    setSettingsOpen(false);
                    setPage('budget');
                    setTimeout(() => window.dispatchEvent(new Event('budget:import')), 250);
                  }
                }
              ]
            : []),
          ...(booksOn(mods)
            ? [
                {
                  group: 'Import',
                  label: 'Import bank statements',
                  hint: 'Bank CSVs into Expenses and Draws. Opens Records first.',
                  button: 'Import',
                  onClick: () => {
                    setSettingsOpen(false);
                    setPage('invoices');
                    setTimeout(() => window.dispatchEvent(new Event('records:import')), 250);
                  }
                }
              ]
            : []),
          ...(mods.kb === false ? [] : [{
            group: 'Import',
            label: 'Import knowledge base',
            hint: 'Adds courses and decks to KNOWLEDGE!B4SE (kb-index.json). Opens it first.',
            button: 'Import',
            onClick: () => {
              setSettingsOpen(false);
              setPage('kb');
              setTimeout(() => window.dispatchEvent(new Event('kb:import')), 250);
            }
          }]),
          {
            group: 'Setup',
            label: 'Run setup again',
            hint: 'Walk through first-run setup (About you, then Routine, Rocket and Timed launch as they arrive). What you save there is added to your account.',
            button: 'Run setup',
            onClick: () => {
              setSettingsOpen(false);
              resetSetupClock();
              void handleSave({ account: { setup: 1 } as BrandSettings['account'] });
            }
          },
          // V20-200 (Dan, Nov 14): Disconnect Google Calendar left out of Data Management for now; how the beta
          // manages Calendar is still to decide (NEXT plan item 5).
        ]}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSave}
        onSetPassword={
          supabase && session
            ? async (password) => {
                const { error } = await supabase!.auth.updateUser({ password, data: { pw_set: true } });
                if (error && /session/i.test(error.message)) {
                  // This device's sign-in has expired: send it back to the sign-in page.
                  await supabase!.auth.signOut({ scope: 'local' });
                  return 'This device was signed out. Sign in again, then set your password.';
                }
                return error ? error.message : null;
              }
            : undefined
        }
        onCheckPassword={supabase && session?.user.email ? (pw) => checkPassword(session.user.email!, pw) : undefined}
        onSendReset={
          supabase && session?.user.email
            ? async () => {
                const { error } = await supabase!.auth.resetPasswordForEmail(session.user.email!, { redirectTo: window.location.origin });
                return error ? error.message : null;
              }
            : undefined
        }
      />
    </div>
    </HiddenPicksContext.Provider>
    </MeditationsContext.Provider>
    </HeaderSearchContext.Provider>
    </BooksContext.Provider>
    </BetaContext.Provider>
  );
}
