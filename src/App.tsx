import { useEffect, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type BrandSettings } from './lib/settings';
import { downloadExport } from './lib/exportData';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { SignIn } from './components/SignIn';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState('');

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
      <div className="app" style={theme} data-bg={settings.background}>
        <div className="sky" aria-hidden="true" />
        <SignIn />
      </div>
    );
  }

  return (
    <div className="app" style={theme} data-bg={settings.background}>
      <div className="sky" aria-hidden="true" />
      <div className="frame">
        <Header settings={settings} />
        <Dashboard />
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
              <button className="btn btn-quiet" onClick={() => supabase?.auth.signOut()}>
                Sign out
              </button>
            )}
          </div>
        </footer>
      </div>
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
