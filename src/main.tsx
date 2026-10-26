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

// The music player window (V12-019) is its own page. If an older offline copy of the app answered
// for it, swap in the real player page instead of starting the app.
const isPlayer = /^\/player(\.html)?\/?$/.test(location.pathname);
if (isPlayer) {
  void fetch(`/player.html${location.search ? `${location.search}&` : '?'}fresh=${Date.now()}`, { cache: 'reload' })
    .then((r) => r.text())
    .then((html) => {
      document.open();
      document.write(html);
      document.close();
    });
}

if (!isPlayer) createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
