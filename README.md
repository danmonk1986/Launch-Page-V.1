# LaunchPage V.1

Personal self-management: plan the day, launch into it, prove you did it.
Module 1 of LaunchPage, built clean-room (no code from the PM textbook repo or its fork).

**Stack:** TypeScript · React + Vite · installable web app (PWA) · Supabase (database + login) · Cloudflare Workers · `app.l4unchp4ge.com`

## Where V.1 stands (Oct 18, 2026 · design freeze)

| Page | What it does |
| --- | --- |
| Launch Page | Header (logo, mantra, clock, routine picker, ⚙ settings), Rockets, timed launches (open links, run rituals, log, hourly repeats), today's routine (NOW card), week calendar with North Star themes, Due today + 3 key tasks, journal |
| 26 Days | Quote, daily goal (= journal theme), Non-Negotiables, rituals (steps + meditation crawl + check-ins), logs (Productivity, Activity, Rest, Food, H2O, Vices), summary (7 / 26 days / all) |
| Tasks | Launch Sheet TO-DO LIST as a table: groups, steps, recurring tasks, filters (one row, extras under ⌄), Recently deleted |
| Budget | Launch Sheet BUDGET tab: import CSV/JSON, export CSV in the sheet's columns, monthly totals by group / pmt category / project / budget category (click a box to filter) |
| Settings | Brand (name, logo, mantra) and colours (day/night themes, backgrounds) |

Restore points are branches named `restore/…` (`restore/v1.0-design-freeze` = the V.1 design freeze). Every change is logged in `docs/DESIGN-LOG.md`.

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
2. SQL Editor → run every script in `supabase/migrations/` in number order (0001 → 0023). Each is safe to run again.
   Two scripts share the number 0007 (`0007_beta_requests.sql`, `0007_tile_colours.sql`): they don't depend on each other, run both. They keep their names because they have already been run.
3. Authentication → URL Configuration: Site URL `https://app.l4unchp4ge.com`; add redirect URLs `http://localhost:5173` and `https://launch-page-v-1.danmonk1986.workers.dev` (exact addresses: Supabase's `*` only matches one part of a domain name).
4. Project Settings → API: copy the Project URL and the `anon` public key into `.env.local`. Never use the `service_role` key in this app.

### Cloudflare Workers (hosting)
1. Workers & Pages → Create → Import a repository → `Launch-Page-V.1`.
2. Build command `npm run build`; deploy command `npx wrangler deploy` (reads `wrangler.jsonc`, serves `dist`).
3. Advanced settings → **Build variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. They are baked in at build time, so they go in build variables, not runtime variables.
4. Every push to `main` redeploys. The site appears at `launch-page-v-1.<account>.workers.dev`.

### Domain (Wix DNS)
1. In Cloudflare → the Worker → Settings → Domains & Routes → add `app.l4unchp4ge.com`. Cloudflare shows the DNS record to create.
2. In Wix: Domains → l4unchp4ge.com → Domain Actions → Manage DNS Records → CNAME → Add Record. Host name `app`, value = the target from step 1.
3. Wait for the padlock (can take up to 48 hours). The main domain keeps pointing at the portfolio.

## Project map

```
src/
  App.tsx                 sign-in gate, theme, data loading, page switch
  components/
    Header.tsx            logo, mantra, page tabs
    Clock.tsx             header date + time
    GearMenu.tsx, SettingsPanel.tsx   brand + colour settings, import/export
    Dashboard.tsx         Launch Page layout
    Launchers.tsx         Rockets + timed launches
    TodayPanel.tsx, RoutineEditor.tsx, RoutinePicker.tsx   routines
    WeekCalendar.tsx      week view + North Star themes
    Tasks.tsx, Projects.tsx           tasks + areas/projects
    Journal.tsx           journal + check-ins
    Days26.tsx, Rituals.tsx           26 Days + rituals
    Budget.tsx            Budget
    Sheet.tsx             dialogs (click off = cancel)
    LaunchReminder.tsx    launch-time pop-up · SignIn.tsx email sign-in · BetaRequest.tsx beta form
  lib/
    store.ts              local-first store: saves on this device, syncs to Supabase
    supabase.ts, settings.ts, exportData.ts
    routines.ts, launchers.ts, events.ts, google.ts, gcalCache.ts, alerts.ts
    tasks.ts, projects.ts, journal.ts, days26.ts, budget.ts, images.ts, view.ts
    nonneg.ts             one-time move of the old on-device Non-Negotiables into 26 Days
supabase/migrations/      database setup scripts, run in number order
public/                   LaunchPage logo and app icons
```

## Design notes

- Product base follows the L4UNCH!P4GE Figma style guide: Roboto Slab headings, Roboto Mono section titles, Roboto body.
- The user's brand layer is editable: logo, goal, mantra, background (synthwave / night sky / plain), purple and teal accents.
- The moving neon floor is the only animation; it stops when the device asks for reduced motion.

The AI Design Log lives in the LaunchPage brain-dump doc, with a checkpoint copy in docs/DESIGN-LOG.md.
