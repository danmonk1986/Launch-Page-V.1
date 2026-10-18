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
- Launchers renamed ROCKETS (Oct 16, 10 PM). Add rocket: the Name box has a ⌄ on the right to show the list, or type to filter; the list holds the originals not on the page yet plus the desktop apps (picking one fills name, link and note). App list trimmed: Spotify and Obsidian removed.
- Timed launches (Oct 16, 10:10 PM): the "On: remind me" switch and desktop notifications are gone (saving a launch turns it on). Six alarm sounds, all made in the browser: Chime, Bell, Rocket, Arcade, Alarm clock, Marimba; tap one to hear it. Run `0013_launch_tone.sql` so the choice syncs.
- Routines (Oct 16, 10:30 PM): rituals hidden from the picker and the Launch Page (kept in the data for 26 Days). Editor: no Type choice; "Duplicate for Night Shift"; Wake Up / Bed; times optional and every step shows as its own row on the dashboard. Each step has + (add below) and ⋯: Re-sort (drag handle, or arrow keys), + Timed launch (opens Add timed launch filled in with the step and its time), + Non-negotiable (adds to the 26 Days template, kept on this device until 26 Days lands), Remove. New routines start with the non-negotiables template as their steps.
- Calendar (Oct 16, 10:45 PM): Google events are kept in LaunchPage (new gcal_events table + this browser) so This Week shows them on load without signing in to Google. The calendar button is now Sync: it signs in if the hour-long pass ran out, then reads 2 weeks back to 8 weeks ahead and replaces the kept copy for those dates (deleted/moved events drop out). Hover shows the last sync time. Disconnect moved to the ⚙ menu. Run `0014_google_events.sql`.
- Tasks (Oct 16, 11:10 PM): tighter step rows; the step form says Step; "Add a step" on a step adds to its task (no nesting). Create launch opens Add timed launch filled in (task, time or 9:30, date, link) to check first; the task links to it once saved. Tasks page buttons: + / folder / × (back to the Launch Page); Import tasks moved to the ⚙ menu. Launch Page Tasks panel hides steps; tapping a task opens it on the Tasks page (scrolled to and lit up). ALL counts outstanding tasks. Checking off a task with open steps asks: Cancel / Just the task / All done.
- Journal (Oct 16, 11:30 PM): headline on top in the mantra purple, left aligned; theme in teal with the date (MM/DD/YY) in beige; the theme carries over from the last entry. "Add check in" opens the optional text. Header shows the run of consecutive days written (skipped days don't appear; the count ends today, or yesterday while today is unwritten). Temporary "Import journal" in the ⚙ menu for the Launch Sheet journal file (delivered to Dan directly, not stored in the repo); days already written are skipped.
- Journal check-ins (Oct 16, 11:45 PM): headline brighter purple; date left, theme right-aligned in the TIMED LAUNCHES style. ADD CHECK IN adds "✓ CHECK IN #1", "#2"… each with its own short reflection and the time it was started (one per routine check-in). Stored in a new checkins column (0015); body keeps all of them as text, and older entries' text shows as check-in #1.
- Timed launches (Oct 16, 11:55 PM): Alarm is one list of sounds plus None (no on/off switch). Changing the time of a repeating launch asks: Today only (or Next one only) / Every time; a one-day change is kept in once_time. Each run is logged (launch_log: planned, +10 minutes added, launched/done/skipped, times) for 26 Days; today's row shows "(+40 → 130 min)". +10 now survives a reload. Run `0016_launch_once_time_and_log.sql`.
- Oct 17, 1 AM: Journal title opens the whole journal (every day with its check-ins; × back). Top row: headline, then mood + date on the right; theme right-aligned under it. Mood: one emoji a day (🔥 😄 🙂 😐 😕 😫), shown before the date on past days and editable in the entry sheet (0017). "N days in a row" sits on the Past days line, right-aligned. Timed launches: 🚀 Launch now beside ✓ and ×. Settings › Scrolling (per device): Card by card snaps each scroll to the next card and keeps the routine fixed beside them, following the time.

## 26 Days page (Oct 17, 1–3 AM)

Dan laid the DM26 Planner prototype over LaunchPage as a mockup and set the order. Everything below is new code in this repo; nothing from the textbook fork.

- **Layout, top to bottom:** quote + daily goal · Non-Negotiables · Rituals · Logging · Summary. The prototype's middle button row is gone: mode comes from the routine picker (HQ, or MWD Days/Nights), and Add/Shuffle/Edit live on the quote card.
- **Quote:** same size, moved left. + adds, ⇄ shuffles (per device), ✎ edits or deletes (spelling fixes). Starts empty: no sample quotes.
- **Daily goal:** title-less box beside the quote. It *is* today's journal theme: change either and both change; it carries over until changed. Text shrinks to keep the longest word on one line. A day with only a goal isn't listed as a journal entry.
- **Non-Negotiables:** restyled as a standard card. Morning / Midday / Evening run up to their check-ins (9, 1, 6; MWD Nights flips to 9 PM, 1 AM, 6 AM); the section you're in is lit teal with NOW. Wake Up and Bed follow the routine's wake/bed. Loggable ones (Productivity block, Activity 3 × 10) have a dashed box, tick only from the log, and open a pre-filled log when tapped. Activity shows this week's days (x/4 wk). A Non-Negotiable named like a ritual opens it. Edit (✎): rename, section, time (none / at a time / routine wake / routine bed), tick or log + amount, reorder, remove (archived, so past days keep their score), vice limits HQ 3 / MWD 2.
- **Bounce back strip:** last 7 routine days (teal = on baseline, purple = dip, ring = today) with what's needed today (80%), vice load vs limit, and the run.
- **Rituals:** routines of kind ritual, as teal-outlined buttons. Tap to run through the steps; Done ticks the matching Non-Negotiable. + adds; ✎ edits name and steps.
- **Logging:** six tiles. Productivity (blocks, quarter steps), Activity (minutes or steps; 100 steps ≈ 1 min), Rest (sleep hours or break minutes), Food (kcal), H2O (Glass 500 / Bottle 750, no typing), Vices (note + Light 0.5 / Medium 1 / Heavy 3, weight remembered per note). Every log has a × stepper and a note; tap an entry to edit or delete. Vices tile turns pink over the limit.
- **Summary:** 7 days / 30 days / All. On baseline %, current run (or days in a dip), vice load per day and week, bounce-back (average dip length). HQ vs MWD (+ Days/Nights rows) with teal on the better mode per column, and a plain-words takeaway once both have 3 finished days. Today so far underneath.
- **Rules kept from the prototype's lessons:** today is the routine day (4 AM–4 AM, 4 PM–4 PM on nights); no sample data; the log is the only proof for loggable items; each day keeps the mode it was lived in and a snapshot of the list.
- **Data:** five new tables in `0018_26_days.sql`. Until it runs, 26 Days saves on this device. The old on-device "Add non-negotiable" template moves into the list once.
- **Checked:** bundled locally and clicked through in a headless browser at 1440 and 390 wide (quote, goal ↔ journal theme, ticks, logs, remembered vice weight, seeded HQ/MWD days for the Summary). Not yet built with Vite/tsc here (npm blocked in this workspace).
- Oct 17, 2:40 AM: the 26 Days day now resets at the active routine's **Bed** time (MWD Nights: 9 AM; HQ: 11 PM), not 4 AM / 4 PM. It's named for the date you wake up into, so a night shift stays on one day through midnight. Routines without a bed time keep 4 AM / 4 PM. The NOW section counts from the same reset.
- Oct 17, 2:45 AM: log amounts (kcal, minutes, hours, steps) and the editor's targets and vice limits take any number; the browser was rejecting values like 700 kcal or a 22-minute break that didn't land on a step.
- Oct 17, 2:55 AM: every timed launch checked off Done logs Productivity (Dan's call: all launches, time actually spent). Blocks = time from Launch to Done, capped at planned + any +10s, in quarter blocks (90 min = 1); done without launching logs the planned time; under ~11 minutes logs nothing. The log carries the launch's name as its note and shares the launch log's id, so re-checking updates instead of doubling.
- Oct 17, 3:05 AM: × quantity now saves one line per item (2 × Bottle = two Bottle lines; Productivity stays one line in quarter blocks). Every log has a Time box, filled with now and editable; the time picked decides which routine day it lands on (an earlier time means earlier, e.g. 11 PM picked at 1 AM).

## Rituals, round 2 (Oct 17, 3:20–4 AM)

Dan's story: Rise to Shine as a timed launch. When busy he pushes it (Snooze / Skip); once settled at MWD, LAUNCH opens the ritual as a pop-out and he works through the steps in a row.

- **Timed launch → ritual:** the timed launch form has a Ritual choice. LAUNCH (reminder or 🚀) opens the ritual over any page, plus any tabs. Done ticks the ritual's Non-Negotiable and checks the launch off. Ritual launches don't log Productivity. Needs `0019_launch_ritual.sql`.
- **Runner:** steps sit side by side as cards (scroll sideways), numbered, ticked one at a time, ticks kept for the routine day (synced in the day record), progress "4/9 done".
- **Step kinds:** Step (optional link: tap the name to open it, e.g. Headway), Meditation (script editable under the step; tap the name to play), Journal check-in (#n: writes today's journal ✓ Check in #n, also editable in the Journal; writing in it ticks the step). Older rituals are read by name: "Meditation"/"Meidation" and "Check In #1".
- **Meditation crawl:** full screen, the script rolls up and away in teal, film-opening style, on synthwave (dark themes) or a snowy day (light themes). Top buttons: ✓ (check it off), pause/play, replay, ✕. Reduced motion shows it still.
- **Rituals card:** a picker at the top right like the routine picker (every ritual, plus edit and add); the chosen ritual fills the card. A Non-Negotiable named like a ritual brings that ritual up on the card.
- **Editor:** one row per step with its kind, link, script or check-in number; reorder and remove.
- **Fixed:** a timed launch with a ritual and no tabs couldn't be launched (button was disabled).
- Oct 17, 3:45 AM · Meditation crawl: words only show once they've cleared the synthwave horizon with a line of space (they fade in there instead of drawing over the grid). A line like "[Pause for five seconds]", "[pause 10]" or "[Pause]" (5 s) holds the crawl when it reaches the reveal line, shown as "· · ·" with a countdown by the buttons. The crawl now moves frame by frame (an unhurried reading pace) so it can hold; it ends once the last line has faded out at the top, and ✓ lights up.
- Oct 17, 3:55 AM · Ritual layout (Dan's sketch): plain steps are small tiles, four to a row (three on tablets, two on phones), number · name · tick on one line; meditation and check-in steps take full rows with their text box underneath. No sideways scrolling.
- Oct 17, 3:55 AM · Meditation crawl text in all caps, like the title.
- Oct 17, 4 AM · Meditation crawl: no title (just the words), and it starts partway up so the first line clears the horizon in about 7 s instead of 15.
- Oct 17, 4:05 AM · Meditation box on the ritual: same font, caps, letter spacing and line width (in em) as the crawl, centred and in teal, so each line breaks in the box where it will on screen; the box grows to fit instead of scrolling. The crawl's width is now set in em to keep the two in step (matches on laptop widths).
- Oct 17, 4:10 AM · Ritual layout follows the step order, for any ritual: plain steps before a meditation sit as tiles (two across) on its left with the meditation on the right; a check-in (or anything after) takes its own row. No meditation = just tiles; no check-in = no row (remove it in the editor). Stacks on narrow screens.
- Oct 17, 6:20 AM · Rituals: Duplicate in the ritual picker. Copies steps, links and meditation; each journal check-in moves to the next number (label too), and a '#n' in the ritual's name bumps the same way (otherwise '(copy)'). Opens in the editor to rename before saving. For Check-in #2 and #3 rituals in the Rise to Shine format.

## Oct 17, 6:40 PM
- **Journal runs on the routine day:** it resets at bed time like 26 Days (MWD Nights: 9 AM; HQ: 11 PM), named for the date you wake into, so a night shift is one page and the next shift opens a fresh one; the last one moves to Past Days. Theme / daily goal carries over until changed. Ritual check-ins write to the same day.
- **Change a day's date:** tap the date on today's entry; it opens the entry with a date box (refuses a date that already has an entry). Moving today's entry to another date opens a fresh page for today. Used for last night's entry, saved under the calendar date before this change.
- **Rituals layout:** plain steps as tiles (two across) with check-ins under them on the left; the meditation on the right takes the left side's height and scrolls inside (still crawl-width), so 10 or 15 steps fit. A ritual without a meditation is just tiles and rows. Stacks on narrow screens with a fixed-height scrolling meditation.

## Oct 17, 10:30 PM · Work Block #1: timed launches that log
- **Logs when checked off** (new row in the timed launch editor): Auto / Productivity / Activity / Rest (break) / Food / H2O / Vice. Activity and Break log the time allotted (Shiftwork Optimization = Activity 10 min every time, like Dan logs it); H2O Glass/Bottle, Food kcal and Vice weight log a fixed amount; Productivity logs time from Launch to Done (or the time allotted if nothing opens). Auto: launches that open tabs/apps log Productivity by time spent (as before); rituals and reminders log nothing.
- **LOG button:** a launch with nothing to open shows LOG instead of 🚀 (list and pop-up). One tap logs its preset and checks it off: no timer, no alarm. With nothing to open and nothing to log, the pop-up button is Done.
- **Hourly repeat:** From / Until (can run past midnight), every day. Each hour is handled on its own (skip = this hour); each LOG adds its own line (e.g. H2O a glass an hour on shift).
- Run `0020_launch_logging_hourly.sql` (adds log_kind, log_amount, until_time; allows hourly). Until then they keep working on this device.
- Oct 17, 10:55 PM · Design pass, header: date 28→24px and time 24→20px (laptop); headline 17→21px and mantra 16→20px; logo 40→54px to match the taller text (phone: 44px). Restore point saved as branch restore/v1-pre-design-pass (tags can't be pushed from Claude's side).
- Oct 17, 11:05 PM · Header (laptop): tabs on the bottom edge (active underline sits on the header border); ⚙, picker and date/time drop to the bottom with them; logo, headline and mantra centred in the space above. 🎧 beside ⚙: a SoundCloud player (playlist/track link, kept per device) slides out to the left; hiding it keeps the music playing.
- Oct 17, 11:05 PM · Header back to a little over its original height (190px on laptop) for white space; the extra room goes around the logo and headline.
- Oct 17, 11:15 PM · Overall settings: ⚙ menu has **Brand settings** (name, logo, headline, mantra, scrolling, password) and **Colour settings** (background, then Night mode and Day mode colours). Night mode = the dark backgrounds, colours unchanged. Day mode = the light backgrounds, defaults from the original palette: purple #8169af, teal #76caba, green #8fbf7f, pink #c47aa8 (deepened slightly on white for legibility). Each colour: the picker (gradient + dropper) and a hex box to paste into. Run `0021_day_colours.sql` to sync day colours.
- Card by card: 12px of room above the sticky NOW card so it isn't cut off.
- Clicking off any pop-up (on the dimmed page) cancels it, like ×. A press that starts inside (e.g. dragging out of a text box) doesn't count. The timed-launch reminder snoozes, as its × does.
- Oct 17, 11:25 PM · Images from the computer (no links): **Logo** in Brand settings (ideal 600 × 110 px; PNG keeps a see-through background, JPEG works; shown 54 px tall). **Your own background** in Colour settings, one for Night mode and one for Day mode (ideal 2560 × 1440 px JPEG, 16:9); it covers the built-in background with a light veil so cards stay readable. Images are shrunk in the browser (backgrounds to 2560 px JPEG ≈ 200–500 KB, logo to 1200 × 220 PNG) and saved with the settings so they sync. Run `0022_background_images.sql`; until then backgrounds stay on that device.
- Oct 17, 11:35 PM · Card by card routine: steps scrolling up fade out under the NOW card (40px fade) instead of being cut off at its edge; room at the bottom so the last step clears the card.
- Oct 17, 11:50 PM · Rockets: ⌄ beside the title shows/hides the rocket tiles; hidden by default, remembered per device. Timed launches always show. Edit opens the tiles; Launch all works either way. Dan: the card is strong and functional, design done.
- Oct 17, 11:55 PM · This Week: the month's theme shows as one bar across the bottom row (centred, spaced caps). Works whether the theme is a daily all-day event (merged when back to back) or one all-day event spanning the month (any all-day event of a week or longer counts as a theme).
- Oct 17, 11:59 PM · This Week, themes fixed: a theme is a one-day all-day event with the same name 7+ days in a row anywhere in the synced calendar (AUDACITY, CONSISTENCY), worked out fresh each time (no remembered list, so Sync can't change it and repeating tasks like SPRINT or DOWNLOAD aren't mistaken for themes). Themes merge into one bar and always sit on the last row. All-day events of a week or longer (OPTIMIZE LAUNCH! SHEET) keep the bar look but sit with the other events.
- Oct 18, 12:05 AM · This Week: every all-day event on the NORTH STAR calendar (the North Star area's linked calendar, or a Google calendar named North Star) is a theme, however many days are synced; the 7-day-run rule stays as a backup. New themes: make them on North Star.
- Oct 18, 12:05 AM · Rockets hidden = their buttons (✎, +, Launch all) hidden too; only Timed launches' + shows. Menu order: Launch Page · 26 Days · Tasks · Budget. This Week: long blocks stay one bar (Dan's call).
- Oct 18, 12:12 AM · Tasks on the Launch Page: Project, Description, Task, Status, Required and ✓ / ⋯ only (Info, Start, Time, Expense hidden), and the table fits the card so the buttons aren't cut off. The Tasks page keeps every column.
- Oct 18, 12:20 AM · Journal moods: 😕 removed (past days keep it); added 🥹 😬 😵‍💫 🤬 🤒 🏂 ❄️ 🌴 🥃 ✈️. Now 15 in three rows of five: 🔥 😄 🥹 🙂 😐 · 😬 😵‍💫 😫 🤬 🤒 · 🏂 ❄️ 🌴 🥃 ✈️.
