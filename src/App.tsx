import { useEffect, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type BrandSettings } from './lib/settings';
import { downloadExport } from './lib/exportData';
import { Header, type PageId } from './components/Header';
import { DateLine } from './components/Clock';
import { ComingSoon, LaunchPageHome } from './components/Dashboard';
import { RoutinePicker } from './components/RoutinePicker';
import { RoutineEditor } from './components/RoutineEditor';
import { TodayPanel, useNow } from './components/TodayPanel';
import { BLOCKED_HELP, LaunchersPanel } from './components/Launchers';
import { LaunchReminder } from './components/LaunchReminder';
import { WeekCalendar } from './components/WeekCalendar';
import {
  isDue,
  isoDate,
  launchStore,
  launcherStore,
  markHandled,
  openTabs,
  readHandled,
  skipToTomorrow,
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
  shiftLine,
  type Routine,
  type Shift
} from './lib/routines';
import { SettingsPanel } from './components/SettingsPanel';
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
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const [reminder, setReminder] = useState<Launch | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [handled, setHandled] = useState(() => readHandled());
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
      const { routines: list, problem } = await loadRoutines(userId);
      const active = await loadActive(userId);
      if (!live) return;
      setRoutines(list);
      setRoutineProblem(problem);
      setActiveId(list.some((r) => r.id === active.id) ? active.id : list[0]?.id ?? null);
      setShift(active.shift);
      const [l1, l2, l3] = await Promise.all([launcherStore.load(userId), launchStore.load(userId), eventStore.load(userId)]);
      if (!live) return;
      setLaunchers(l1.items);
      setLaunches(l2.items);
      setEvents(l3.items);
      setStoreProblem(l1.problem ?? l2.problem ?? l3.problem);
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

  // Timed launches: pop the reminder when one is due and not handled today.
  useEffect(() => {
    if (reminder) return;
    const due = launches.find(
      (l) => isDue(l, now) && !handled[`${l.id}:${isoDate(now)}`] && !(snoozed[l.id] && snoozed[l.id] > now.getTime())
    );
    if (due) setReminder(due);
  }, [now, launches, reminder, snoozed, handled]);

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
    setStatus(blocked ? BLOCKED_HELP : `Launched ${l.title}: ${l.urls.length} tabs.`);
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

  const theme = {
    '--accent-purple': settings.accentPurple,
    '--accent-teal': settings.accentTeal
  } as CSSProperties;

  if (!authReady) return <div className="app" style={theme} data-bg={settings.background} />;
  if (supabase && !session) {
    return (
      <div className="app app-light" style={theme}>
        <SignIn />
      </div>
    );
  }

  return (
    <div className="app" style={theme} data-bg={settings.background}>
      <div className="sky" aria-hidden="true">
        <div className="sky-lines" />
        <div className="sky-horizon" />
        <div className="sky-floor" />
      </div>
      <Header
        settings={settings}
        page={page}
        onPage={setPage}
        routineName={activeRoutine ? routineLabel(activeRoutine, shift) : undefined}
      />
      <div className="frame">
        <DateLine shiftLine={activeRoutine ? shiftLine(activeRoutine, shift) : 'Add a routine to set your shift and wake times.'}>
          <RoutinePicker
            routines={routines}
            activeId={activeRoutine?.id ?? null}
            shift={shift}
            onPick={pickRoutine}
            onAdd={() => setEditor({ open: true, routine: null })}
            onEdit={() => setEditor({ open: true, routine: activeRoutine })}
          />
        </DateLine>
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
                  launchers={launchers}
                  launches={launches}
                  onSaveLauncher={launcherOps.save}
                  onDeleteLauncher={launcherOps.remove}
                  onSaveLaunch={launchOps.save}
                  onDeleteLaunch={launchOps.remove}
                  onStatus={setStatus}
                  handled={handled}
                  today={now}
                  onFinish={finishLaunch}
                />
              }
              week={<WeekCalendar events={events} onSave={eventOps.save} onDelete={eventOps.remove} />}
              today={
                <TodayPanel
                  routine={activeRoutine}
                  shift={shift}
                  onEdit={() => setEditor({ open: true, routine: activeRoutine })}
                />
              }
            />
          ) : (
            <ComingSoon page={page} />
          )}
        </main>
        <footer className="toolbar">
          <img className="toolbar-logo" src="/launchpage-logo.png" alt="LaunchPage" />
          <p className="toolbar-status" role="status">
            {status || (supabase ? `Signed in as ${session?.user.email}` : 'Running on this device only. Add Supabase keys to sync.')}
          </p>
          <div className="toolbar-actions">
            <button className="btn btn-quiet" onClick={() => downloadExport(settings)}>
              Export my data
            </button>
            <button className="btn btn-quiet" onClick={() => setSettingsOpen(true)}>
              Brand settings
            </button>
            {supabase && session && (
              <button className="btn btn-quiet" onClick={() => supabase?.auth.signOut({ scope: 'local' })}>
                Sign out
              </button>
            )}
          </div>
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
