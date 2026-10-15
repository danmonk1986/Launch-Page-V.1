# LaunchPage V.1

Personal self-management: plan the day, launch into it, prove you did it.
Module 1 of LaunchPage, built clean-room (no code from the PM textbook repo or its fork).

**Stack:** TypeScript · React + Vite · installable web app (PWA) · Supabase (database + login) · Cloudflare Pages · `app.l4unchp4ge.com`

## Where Step 1 stands

| # | Task | Status |
| --- | --- | --- |
| 1.1 | Starter app: brand theme, synthwave background, dashboard shell | Done |
| 1.2 | GitHub repo, first push | Waiting on repo |
| 1.3 | Supabase project + `settings` table with Row Level Security | Script ready: `supabase/migrations/0001_foundation.sql` |
| 1.4 | Login by email link | Built; turns on when Supabase keys are set |
| 1.5 | Editable brand settings, synced | Built |
| 1.6 | Cloudflare Pages hosting | Waiting on account |
| 1.7 | `app.l4unchp4ge.com` via Wix DNS | Waiting on 1.6 |
| 1.8 | Installable + opens offline | Built (vite-plugin-pwa) |
| 1.9 | Export my data | Built (settings only so far) |

Without Supabase keys the app runs on this device only and saves settings in the browser.

## Run it on your computer

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env.local   # fill in after Supabase setup (optional)
npm run dev                  # http://localhost:5173
```

## Setup, one service at a time

### Supabase (database + login)
1. Create a free account at supabase.com and a project named `launchpage`, region Canada (Central).
2. SQL Editor → paste `supabase/migrations/0001_foundation.sql` → Run.
3. Authentication → URL Configuration: Site URL `https://app.l4unchp4ge.com`; add redirect URLs `http://localhost:5173` and `https://*.pages.dev`.
4. Project Settings → API: copy the Project URL and the `anon` public key into `.env.local`. Never use the `service_role` key in this app.

### Cloudflare Pages (hosting)
1. Create a free account, then Workers & Pages → Create → Pages → Connect to Git → pick `Launch-Page V.1`.
2. Build command `npm run build`, output folder `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
4. Every push to `main` redeploys.

### Domain (Wix DNS)
1. In Cloudflare Pages → the project → Custom domains → add `app.l4unchp4ge.com`. Cloudflare shows a CNAME target like `launch-page-v1.pages.dev`.
2. In Wix: Domains → l4unchp4ge.com → Domain Actions → Manage DNS Records → CNAME → Add Record. Host name `app`, value = the target from step 1.
3. Wait for the padlock (can take up to 48 hours). The main domain keeps pointing at the portfolio.

## Project map

```
src/
  App.tsx                 sign-in gate, theme, toolbar
  components/
    Header.tsx            logo, goal, mantra, clock
    Dashboard.tsx         panels, filled in step by step
    SettingsPanel.tsx     brand settings
    SignIn.tsx            email sign-in link
  lib/
    supabase.ts           client (null when no keys)
    settings.ts           brand settings: local + cloud
    exportData.ts         "Export my data"
supabase/migrations/      database setup scripts, run in order
public/                   LaunchPage logo and app icons
```

## Design notes

- Product base follows the L4UNCH!P4GE Figma style guide: Roboto Slab headings, Roboto Mono section titles, Roboto body.
- The user's brand layer is editable: logo, goal, mantra, background (synthwave / night sky / plain), purple and teal accents.
- The moving neon floor is the only animation; it stops when the device asks for reduced motion.

The AI Design Log lives in the LaunchPage brain-dump doc.
