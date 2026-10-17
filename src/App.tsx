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
import { TodayPanel, useNow } from './components/TodayPanel';
import { BLOCKED_HELP, LaunchersPanel } from './components/Launchers';
import { LaunchReminder, TimeUpReminder } from './components/LaunchReminder';
import { chime, notify, unlockAudioOnFirstGesture } from './lib/alerts';
import { WeekCalendar } from './components/WeekCalendar';
import { TasksPage, TasksPanel } from './components/Tasks';
import { ProjectsSheet } from './components/Projects';
import { matchCalendar, projectStore, type Project } from './lib/projects';
import { journalStore, type JournalEntry } from './lib/journal';
import { JournalPanel } from './components/Journal';
import { buildImport, taskStore, trashExpired, type ImportRow, type Task } from './lib/tasks';
import { addTaskToGoogle, googleConfigured, knownCalendars } from './lib/google';
import {
  isDue,
  isoDate,
  launchStore,
  launcherStore,
  markHandled,
  openTabs,
  describeOpens,
  readHandled,
  skipToTomorrow,
  launchersFor,
  splitShared,
  dedupeRoutines,
  type Launch,
  type Launcher
} from './lib/launchers';
import { eventStore, type CalEvent } from './lib/events';
import type { Store } from './lib/store';
import {
  deleteRoutine,
  loadActive,
  loadRoutines,
  routineLabel,
  saveActive,
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [calVersion, setCalVersion] = useState(0);
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Launch | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [handled, setHandled] = useState(() => readHandled());
  const [timeUp, setTimeUp] = useState<Launch | null>(null);
  const [extraMinutes, setExtraMinutes] = useState<Record<string, number>>({});
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
      const [p1, t1, j1] = await Promise.all([projectStore.load(userId), taskStore.load(userId), journalStore.load(userId)]);
      if (!live) return;
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

  const activeRoutine = routines.find((r) => r.id === activeId) ?? routines[0] ?? null;

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
  async function createLaunchFromTask(t: Task) {
    const monthly = t.status === 'MTH RCR' && /^\d{1,2}$/.test(t.repeatRule ?? '');
    // No time: 9:30 AM, the first work block. No date: today if 9:30 hasn't passed, else tomorrow.
    const now = new Date();
    const firstBlock = now.getHours() * 60 + now.getMinutes() < 9 * 60 + 30 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    const launch: Launch = {
      id: crypto.randomUUID(),
      title: t.task,
      atTime: t.atTime ?? '09:30',
      repeat: monthly ? 'monthly' : 'once',
      weekdays: [],
      monthDay: monthly ? Number(t.repeatRule) : null,
      onDate: monthly ? null : t.endDate ?? t.startDate ?? isoDate(firstBlock),
      minutes: 30,
      urls: t.link ? [t.link] : [],
      active: true,
      movedTo: null,
      sound: true,
      notify: false,
      sort: launches.length
    };
    await launchOps.save(launch);
    await taskOps.save({ ...t, launchId: launch.id });
    setStatus(`Timed launch made for ${t.task}${t.atTime ? '' : ' at 9:30 AM. Change the time in Timed launches'}.`);
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
    if (reminder.sound !== false) chime('start');
    if (reminder.notify) notify(`Launch time: ${reminder.title}`, `${describeOpens(reminder.urls)} · ${reminder.minutes} min`);
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
      const [h, m] = l.atTime.split(':').map(Number);
      const end = h * 60 + m + l.minutes + (extraMinutes[l.id] ?? 0);
      return nowMin >= end;
    });
    if (!over) return;
    setEndAlerted((m) => ({ ...m, [`${over.id}:${today}`]: true }));
    setTimeUp(over);
    if (over.sound !== false) chime('end');
    if (over.notify) notify(`Time's up: ${over.title}`, `${over.minutes} minutes are done. Check it off or take 10 more.`);
  }, [now, launches, handled, endAlerted, extraMinutes, timeUp, reminder]);

  async function finishLaunch(l: Launch, how: 'done' | 'skipped') {
    setHandled(markHandled(l.id, new Date(), how));
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
    <div className="app" style={theme} data-bg={settings.background} data-tone={light ? 'light' : 'dark'}>
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
        onPage={setPage}
        right={
          <>
            <div className="topbar-controls">
            <GearMenu
              items={[
                { label: 'Brand settings', onClick: () => setSettingsOpen(true) },
                { label: 'Export my data', onClick: () => downloadExport(settings) },
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
              routines={routines}
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
                />
              }
              week={
                <WeekCalendar
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
                  onOpenAll={() => setPage('tasks')}
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
              onImport={importTasks}
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
          setExtraMinutes((m) => ({ ...m, [l.id]: (m[l.id] ?? 0) + 10 }));
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
