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
| Google Calendar two-way sync | ▶ next, plan agreed below, waiting on setup |
| L4 To-Do (Due today + 3 key tasks) | after calendar |
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

## Next: Google Calendar sync plan

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
