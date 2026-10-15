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
import { TodayPanel } from './components/TodayPanel';
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
        {routineProblem && (
          <p className="notice" role="status">
            {routineProblem}
          </p>
        )}
        <main aria-label={page === 'launch' ? 'Launch Page' : 'Page'}>
          {page === 'launch' ? (
            <LaunchPageHome
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
