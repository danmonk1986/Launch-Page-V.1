import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, LIGHT_BACKGROUNDS, loadSettings, saveSettings, type BrandSettings } from './lib/settings';
import { downloadExport } from './lib/exportData';
import { Header, type PageId } from './components/Header';
import { HeaderClock } from './components/Clock';
import { ComingSoon, LaunchPageHome } from './components/Dashboard';
import { RoutinePicker } from './components/RoutinePicker';
import { RoutineEditor } from './components/RoutineEditor';
import { addNonNeg, readNonNegs } from './lib/nonneg';
import { TodayPanel, useNow } from './components/TodayPanel';
import { BLOCKED_HELP, LaunchersPanel, type TimedPreset } from './components/Launchers';
import { LaunchReminder, TimeUpReminder } from './components/LaunchReminder';
import { chime, unlockAudioOnFirstGesture } from './lib/alerts';
import { WeekCalendar } from './components/WeekCalendar';
import { TasksPage, TasksPanel } from './components/Tasks';
import { ProjectsSheet } from './components/Projects';
import { matchCalendar, projectStore, type Project } from './lib/projects';
import { buildJournalImport, journalStore, type JournalEntry } from './lib/journal';
import { JournalPanel } from './components/Journal';
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
import { SignIn } from './components/SignIn';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const tasksRef = useRef<Task[]>([]);
  const [gcalOff, setGcalOff] = useState(0);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const journalInput = useRef<HTMLInputElement>(null);
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
      setStoreProblem(l1.problem ?? l2.problem ?? l3.problem ?? p1.problem ?? t1.problem ?? j1.problem);
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
  function deleteJournal(id: string) {
    const next = journalRef.current.filter((x) => x.id !== id);
    journalRef.current = next;
    setJournal(next);
    void journalStore.remove(userId, id, next);
    setStatus('Journal entry deleted.');
  }

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
      (l) => isDue(l, now) && !handled[`${l.id}:${isoDate(now)}`] && !(snoozed[l.id] && snoozed[l.id] > now.getTime())
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
    const today = isoDate(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const over = launches.find((l) => {
      const key = `${l.id}:${today}`;
      if (handled[key] !== 'launched' || endAlerted[key]) return false;
      const [h, m] = timeFor(l, now).split(':').map(Number);
      const end = h * 60 + m + l.minutes + extraToday(l.id);
      return nowMin >= end;
    });
    if (!over) return;
    setEndAlerted((m) => ({ ...m, [`${over.id}:${today}`]: true }));
    setTimeUp(over);
    if (over.sound !== false) chime('end', over.tone);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, launches, handled, endAlerted, launchLog, timeUp, reminder]);

  async function finishLaunch(l: Launch, how: 'done' | 'skipped') {
    setHandled(markHandled(l.id, new Date(), how));
    logLaunch(l, () => ({ outcome: how, finishedAt: new Date().toISOString() }));
    if (reminder?.id === l.id) setReminder(null);
    if (how === 'skipped') {
      // Skip today = same time tomorrow.
      await launchOps.save(skipToTomorrow(l, new Date()));
      setStatus(`${l.title} moved to tomorrow, same time.`);
    } else {
      setStatus(`${l.title} checked off for today.`);
    }
  }

  function launchNow(l: Launch) {
    const blocked = openTabs(l.urls);
    // Opening the tabs is not finishing: it stays open until checked off.
    setHandled(markHandled(l.id, new Date(), 'launched'));
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
    '--accent-purple': ink(settings.accentPurple, 85),
    '--accent-teal': ink(settings.accentTeal, 62),
    '--accent-green': ink(settings.accentGreen, 70),
    '--accent-pink': ink(settings.accentPink, 80)
  } as CSSProperties;

  if (!authReady) return <div className="app" style={theme} data-bg={settings.background} data-tone={light ? 'light' : 'dark'} />;
  if (supabase && !session) {
    return (
      <div className="app app-light" style={theme}>
        <SignIn />
      </div>
    );
  }

  return (
    <div className={scrolled ? 'app is-scrolled' : 'app'} style={theme} data-bg={settings.background} data-tone={light ? 'light' : 'dark'}>
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
            <input
              ref={journalInput}
              type="file"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const add = buildJournalImport(JSON.parse(await f.text()), journalRef.current);
                  if (!add.length) return setStatus('Nothing new to import: those days are already in your journal.');
                  const next = [...journalRef.current, ...add];
                  journalRef.current = next;
                  setJournal(next);
                  setPage('launch');
                  for (const j of add) await journalStore.save(userId, j, next);
                  setStatus(`Imported ${add.length} journal ${add.length === 1 ? 'entry' : 'entries'}.`);
                } catch (err) {
                  setStatus((err as Error).message);
                }
              }}
            />
            <GearMenu
              items={[
                { label: 'Brand settings', onClick: () => setSettingsOpen(true) },
                { label: 'Import tasks', onClick: () => importInput.current?.click() },
                { label: 'Import journal', onClick: () => journalInput.current?.click() },
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
                          setSettingsOpen(true);
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
              journal={<JournalPanel entries={journal} today={now} onSave={saveJournal} onDelete={deleteJournal} />}
              today={
                <TodayPanel
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
      <LaunchReminder
        launch={reminder}
        onLaunch={launchNow}
        onSnooze={(l) => {
          setSnoozed((m) => ({ ...m, [l.id]: Date.now() + 10 * 60_000 }));
          setReminder(null);
        }}
        onSkip={(l) => finishLaunch(l, 'skipped')}
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
            delete next[`${l.id}:${isoDate(new Date())}`];
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
        baseline={() => readNonNegs().map((n) => n.label)}
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
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSave}
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
