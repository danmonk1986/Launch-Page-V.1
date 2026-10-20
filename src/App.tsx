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
import { RoutinePicker } from './components/RoutinePicker';
import { RoutineEditor } from './components/RoutineEditor';
import { clearLegacyNonNegs, readLegacyNonNegs } from './lib/nonneg';
import { syncNonNegs } from './lib/nnsync';
import { Days26Page } from './components/Days26';
import {
  DEFAULT_CONFIG,
  activeNonNegs,
  configStore,
  dayId,
  dayStore,
  effShift,
  flipsNow,
  logStore,
  modeOf,
  nonNegForRitual,
  nonNegStore,
  ritualKey,
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
import { BLOCKED_HELP, LaunchersPanel, type TimedPreset } from './components/Launchers';
import { LaunchReminder, TimeUpReminder } from './components/LaunchReminder';
import { chime, unlockAudioOnFirstGesture } from './lib/alerts';
import { WeekCalendar } from './components/WeekCalendar';
import { TasksPage, TasksPanel } from './components/Tasks';
import { ProjectsSheet } from './components/Projects';
import { matchCalendar, projectStore, type Project } from './lib/projects';
import { buildJournalImport, byNewest, checkinsOf, journalStore, newEntry, withCheckins, type JournalEntry } from './lib/journal';
import { JournalPanel } from './components/Journal';
import { Sheet } from './components/Sheet';
import { RitualRunner } from './components/Rituals';
import { buildImport, taskStore, trashExpired, type ImportRow, type Task } from './lib/tasks';
import { addTaskToGoogle, googleConfigured, knownCalendars, wasConnected } from './lib/google';
import {
  isDue,
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
  const [page, setPage] = useState<PageId>('launch');
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
  const [d26Config, setD26Config] = useState<Config>(DEFAULT_CONFIG);
  const [d26Ready, setD26Ready] = useState(false);
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
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
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
  const eventOps = ops(eventStore, events, setEvents, (e) => e.title);
  const projectOps = ops(projectStore, projects, setProjects, (p) => p.name);
  const taskOps = ops(taskStore, tasks, setTasks, (t) => t.task);
  const nonNegOps = ops(nonNegStore, nonnegs, setNonnegs, (n) => n.label);
  const quoteOps = ops(quoteStore, quotes, setQuotes, () => 'Quote');
  const budgetOps = ops(budgetStore, budget, setBudget, (l) => l.description);
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

  /** ⋯ → Create launch: a timed launch from the task, opening its link at its time. */
  /** Create launch from a task: opens Add timed launch filled in, so it can be checked before saving. */
  function createLaunchFromTask(t: Task) {
    const monthly = t.status === 'MTH RCR' && /^\d{1,2}$/.test(t.repeatRule ?? '');
    // No time: 9:30 AM, the first work block. No date: today if 9:30 hasn't passed, else tomorrow.
    const now = new Date();
    const firstBlock = now.getHours() * 60 + now.getMinutes() < 9 * 60 + 30 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    setPage('launch');
    setTimedPreset({
      fill: {
        title: t.task,
        atTime: t.atTime ?? '09:30',
        repeat: monthly ? 'monthly' : 'once',
        weekdays: [],
        monthDay: monthly ? Number(t.repeatRule) : null,
        onDate: monthly ? null : t.endDate ?? t.startDate ?? isoDate(firstBlock),
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

  // Timed launches: pop the reminder when one is due and not handled today.
  useEffect(() => {
    if (reminder) return;
    const due = launches.find(
      (l) => isDue(l, now) && !handled[runKey(l, now)] && !(snoozed[l.id] && snoozed[l.id] > now.getTime())
    );
    if (due) setReminder(due);
  }, [now, launches, reminder, snoozed, handled]);

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
      if (handled[key] !== 'launched' || endAlerted[key]) return false;
      const [h, m] = timeFor(l, now).split(':').map(Number);
      const end = h * 60 + m + l.minutes + extraToday(l.id);
      return nowMin >= end;
    });
    if (!over) return;
    setEndAlerted((m) => ({ ...m, [runKey(over, now)]: true }));
    setTimeUp(over);
    if (over.sound !== false) chime('end', over.tone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, handled, endAlerted, launchLog, timeUp, reminder]);

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
      const spent = run.launchedAt && opensSomething(l) ? (Date.now() - new Date(run.launchedAt).getTime()) / 60_000 : allowed;
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
                  onSaveLaunch={launchOps.save}
                  onDeleteLaunch={launchOps.remove}
                  onStatus={setStatus}
                  handled={handled}
                  today={now}
                  onFinish={finishLaunch}
                  onLaunchNow={launchNow}
                  log={launchLog}
                  preset={timedPreset}
                  onPresetUsed={() => setTimedPreset(null)}
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
                />
              }
              tasks={
                <TasksPanel
                  tasks={tasks}
                  projects={projects}
                  today={now}
                  onSave={taskOps.save}
                  onDelete={taskOps.remove}
                  onSaveMany={taskOps.saveMany}
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
              onSave={taskOps.save}
              onDelete={taskOps.remove}
                  onSaveMany={taskOps.saveMany}
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
              onTick={tickToday}
              checkinText={checkinText}
              onCheckin={setCheckin}
            />
          ) : page === 'budget' ? (
            <BudgetPage lines={budget} projects={projects} onSave={budgetOps.save} onDelete={budgetOps.remove} onReplace={replaceBudget} onClose={() => setPage('launch')} />
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
      <LaunchReminder
        launch={reminder}
        onLaunch={launchNow}
        onSnooze={(l) => {
          setSnoozed((m) => ({ ...m, [l.id]: Date.now() + 10 * 60_000 }));
          setReminder(null);
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
        onMore={(l) => {
          setTimeUp(null);
          logLaunch(l, (g) => ({ extra: g.extra + 10 }));
          setEndAlerted((m) => {
            const next = { ...m };
            delete next[runKey(l, new Date())];
            return next;
          });
          setStatus(`${l.title}: 10 more minutes.`);
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
  );
}
