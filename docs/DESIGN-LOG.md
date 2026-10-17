# LaunchPage V.1 — AI Design Log (checkpoint)

Saved Oct 16, 2026, 12:40 AM, before switching to the DM Planner chat.
Live app: https://launch-page-v-1.danmonk1986.workers.dev · Repo: danmonk1986/Launch-Page-V.1

## Where we are

| Piece | Status |
|---|---|
| L1 Look (synthwave, neon palette, rocket favicon) | ✅ built and tested |
| L2 Routines (MWD Days/Nights, HQ, timeline) | ✅ built and tested |
| L3 Launchers + timed launches | ✅ built and tested |
| Week calendar strip (LaunchPage events) | ✅ built |
| Google Calendar two-way sync | ✅ built (Oct 16, 1 AM), switches on once VITE_GOOGLE_CLIENT_ID is set |
| L4 Tasks (own tab + Due today / 3 key tasks on the Launch Page) | ▶ stage 1–2 built Oct 16, 2:40 AM; Add to calendar / Invite / Create launch next |
| Link timed launches · calendar · to-dos | after To-Do |
| Routine rules, L6 Journal, 26 Days page | later |

## Built on Oct 15 (evening session)

- Each routine has its own launcher tiles; changing one routine doesn't touch another. MWD Days and Nights share a set.
- The original 8 tiles are suggestions in the Name field (Add and Edit); picking one fills link, note and colour.
- Edit form has a Position picker to move a tile.
- Toolbar is icons: pencil (edit), + (add), rocket (launch all), 36px.
- Timed launches: tabs (Active / Complete / Tomorrow / All) sit beside the title as small text with a purple underline; + icon adds one.
- Each timed launch has its own Alarm and Notification switches (alarm tested on both start and end, rings in the open tab).
- Time allotted can go down to 1 minute.
- Complete tab: X clears a row from today's list (the launch is kept).
- Save buttons just say Save.
- Brand settings: four theme colours (Teal, Purple, Green, Pink). Teal and Purple run the app; all four are launcher colours.
- Duplicate routines (from two devices seeding at once) are removed on load; missing tiles move onto the kept one.
- Sync fix: a change that fails to reach Supabase is kept on the device and retried on the next load, so a reload can't wipe it.

## Supabase scripts (run in order in SQL Editor; 4–7 not confirmed run yet)

1. `0001_foundation.sql` ✅
2. `0002_routines.sql` ✅
3. `0003_launchers_events.sql` ✅
4. `0004_launch_moves.sql`
5. `0005_launch_alerts.sql` (alarm/notification per launch)
6. `0006_launcher_pink.sql` (fourth tile colour)
7. `0007_tile_colours.sql` (Green and Pink sync from Brand settings)
8. `0008_projects_tasks.sql` (areas, projects and tasks) ✅ Oct 16
9. `0009_task_steps.sql` (steps under tasks)

## Google Calendar sync (built Oct 16)

- Connect Google / Reconnect Google button on the week panel; Google events show with a pink edge and their time.
- New events: Save to LaunchPage or Google Calendar. Google events: rename, move all-day dates, delete, Open in Google Calendar. Timed events keep their times (change those in Google).
- Refreshes when the tab gets focus and every 5 minutes.

### Plan

- The app talks to Google straight from the browser with Google's sign-in (token lasts an hour, renews quietly). No server code, no cost, no secret key in the app; only a public Client ID.
- Read: Google events show in the week strip beside LaunchPage events.
- Write: adding or editing an event can also save it to Google ("Also add to Google Calendar").
- Limit: syncs while LaunchPage is open. Background sync (server function) is later.

Dan's setup (10–15 min):
1. console.cloud.google.com → new project `LaunchPage`.
2. APIs & Services → Library → Google Calendar API → Enable.
3. OAuth consent screen → External, app name LaunchPage, leave in Testing, add danmonk1986@gmail.com as a Test user.
4. Credentials → OAuth client ID → Web application. Authorized JavaScript origins: `http://localhost:5173` and `https://launch-page-v-1.danmonk1986.workers.dev`.
5. Copy the Client ID (ends in `.apps.googleusercontent.com`).
6. Cloudflare build variable `VITE_GOOGLE_CLIENT_ID` = that value, then send it to Claude.

## Backlog

- To-Do list with Send to calendar / Invite people / Create launcher; checking off a launch ticks the to-do and logs Productivity in 26 Days.
- Browser extension to open a new window with all tabs.
- Domain: transfer l4unchp4ge.com from Wix to Porkbun, nameservers to Cloudflare, then app.l4unchp4ge.com.
- Custom email sender for Supabase sign-in links.
- Launcher archive.

## L4 Tasks (Oct 16)

- Tasks tab: sections like the Launch Sheet: Due today · 3 key tasks · In progress · Appointments · Within 30 days · On deck (+30) · Pending · Monthly recurring · Annual recurring · Done.
- Due today is automatic: date required today or earlier, or a recurring task whose day is today. 3 key tasks = status THREE.
- ✓ checks off (strike-through like timed launches), ✗ moves to tomorrow; on a done task ✗ clears it from Done.
- Areas: NORTH STAR (was THEME), DANMONK26, HEALTH+WELLNESS, FNTSY LVNG › Travel+Adventure, STARDVST APP SHOP › StreamVU / LaunchPage / Zaptor, STARDVST BRAND SHOP (clients), STARDVST MWD, STARDVST LTD (grey). Each has a neon colour and links to a Google calendar (auto-linked by name).
- Launch Page shows Due today and 3 key tasks only.

## Launch Page housekeeping (Oct 16, 2:50–3:10 AM)

- Header: tabs under the logo; right side has the ⚙ settings gear + compact routine picker (40px) above the date and time at their original size. The page date line and shift line are gone.
- Routine panel: list keeps its order from wake-up; a standalone glowing "now" card sits on top.
- Week: compact ivory Google boxes with a pastel-neon calendar edge; monthly themes (CONSISTENCY, AUDACITY) line up along the bottom row; holiday calendars hidden.
- Launcher tiles: fixed 196 × 62px, reflow instead of stretching; name 14 / note 20 characters with a counter.

## Next session

1. Run `0008_projects_tasks.sql`.
2. Dan's notes on the Tasks page.
3. Task actions: Add to calendar · Invite people · Create launch. Then calendar Add uses the project picker.
4. Optional: paste-in import of Launch Sheet task rows.

## Tasks round 2 (Oct 16, 3:30–4:10 AM)

- Pills: ALL · DUE TODAY · 3 KEY TASKS · IN PROGRESS · APPOINTMENTS · ON DECK · MONTHLY · ANNUAL · PENDING · COMPLETED. Due today hides when empty.
- Monthly repeats: "on a date" (the 17th) or "on a weekday" (2nd Tuesday). Annual: month + day.
- Launch Sheet TO-DO LIST imported from a file (114 tasks; overdue redated to Oct 24). Import button on the Tasks page; the file stays out of the repo.
- ⋯ menu per row: Add to calendar (project's Google calendar) · Create launch · Add a step · Move to tomorrow · Move to… · Remove.
- Steps under tasks (+ beside the name, Steps in the form). Alternating soft-teal (#76CABA) rows instead of lines.

## Next session

1. Run `0009_task_steps.sql`.
2. Dan's notes from testing Tasks on shift.
3. Invite people (needs one more Google permission). Calendar Add uses the project picker.
4. Hard stop: Dan powers down by 6:20 AM after a max-output night.

## Polish (Oct 16, 5:10–5:45 AM)

- Tasks: Info column (link or tap-to-call phone, long names end in …), Expense column with currency (CAD default), centred columns, same-width project pills, Task keeps its width, description suggestions.
- Forms site-wide: Save · Delete · Close icons in the header. All icon buttons 36px. ⚙ menu: Brand settings · Export · Change password · Sign out. Tabs fold into a teal ⌄ when narrow.
- Recently deleted (30 days, Restore / Delete forever) — run `0010_task_trash.sql`.
- Routine card: glowing NOW pill in the Now box; every item's notes on their own line under the time. Routine menu: edit and add as icons.
- Create launch with no time: 9:30 AM (first work block).

## Next session (tonight)

1. Run `0009_task_steps.sql` and `0010_task_trash.sql` if not done.
2. Dan's notes from testing; tie it all together (launches ↔ tasks ↔ calendar).
3. Start the Planner.

## Themes + Journal (Oct 16, evening)
- Background options are now five: Synthwave, Night sky, Plain, **Navy** (solid #0b0820) and **Damascus (light)**.
- Damascus: white with a grey #989696 Damascus-steel pattern drawn in code (no images), rolling slowly upward and fading out towards the top. Beige text becomes #444242; the neons are deepened slightly so they read on white. Reduced motion stops the roll.
- Journal (L6) on the Launch Page: today's headline, theme line and an optional page, typed in place and saved automatically. Past days are listed underneath (5, then "Show all"); tap one to edit or delete it. + adds an entry for another day; one entry per day.
- Run `supabase/migrations/0011_journal.sql` to sync the Journal; until then it saves on this device.
- Backgrounds reorganised (Oct 16, 6:30 PM): Plain retired (anyone on it moves to Navy). Order: Synthwave / Starry night / Navy · Damascus / Snowy day / White. Snowy day = tiny grey snowflakes drifting down over white in two layers. All three light backgrounds share one light-tone style. Run `0012_backgrounds.sql` so the new choices sync; until then they stay on the device.
- Timed launches can open desktop apps (Oct 16, 6:40 PM): "Apps to open" picks (Claude, Slack, Spotify, Notion, Figma, Zoom, Teams, Discord, VS Code, Obsidian), plus any app link typed under Other links. App links open without an empty tab; javascript:/data:/file: links are refused. Launcher tiles accept app links too.
- Header fixed to the top (Oct 16, 9:50 PM), with a frosted background. On phones it slims down once you scroll (headline, mantra and date fold away; time, picker, gear and tabs stay). Menu is now Launch Page / Tasks / 26 Days / Budget; Summary and Planner are off the menu for now. Budget is a placeholder page.
