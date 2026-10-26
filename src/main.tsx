import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// New version deployed? Swap it in and reload straight away instead of on the second refresh.
// Open tabs also check for a new version every 10 minutes.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (reg) setInterval(() => reg.update(), 10 * 60_000);
  }
});

// The headphones / music player was removed (Oct 26): clear what it kept on this device.
try {
  for (const k of ['launchpage.music.url', 'launchpage.music.saved', 'launchpage.music.spot']) localStorage.removeItem(k);
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
