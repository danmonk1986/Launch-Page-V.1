# LaunchPage V.1 · Session log

The overall story of each work session. Item-by-item detail lives in [DESIGN-LOG.md](DESIGN-LOG.md).

---

## Session 1 · Oct 15–16, 2026 · Module 1: the Launch Page

**Where it ended:** Module 1 (the Launch Page) is built, reviewed section by section with Dan, and live at launch-page-v-1.danmonk1986.workers.dev. Next session starts **26 Days** in a new chat.

### What got built
- **Foundation:** React + TypeScript + Vite PWA on Cloudflare Workers, Supabase for sign-in and data (row-level security on every table). Every list also keeps a copy in the browser and retries failed saves, so nothing is lost offline or before a setup script is run.
- **Header:** logo, headline + mantra, big date and time, routine picker, ⚙ menu. Fixed to the top; slims down on phones. Menu: Launch Page / Tasks / 26 Days / Budget.
- **Themes:** six backgrounds. Dark: Synthwave, Starry night, Navy. Light: Damascus (code-drawn grey steel pattern rolling upward), Snowy day, White. Light themes turn beige text to #444242.
- **ROCKETS (launchers):** tiles per routine, drag to reorder, a name box with a list of originals and desktop apps (Claude, Slack, Notion, Figma, Zoom, Teams, Discord, VS Code) via app links.
- **Timed launches:** a reminder pops at the time with SKIP / SNOOZE / LAUNCH; LAUNCH opens the tabs and apps. Six built-in alarm sounds or None (Rocket is the favourite). Time's up alarm with +10 min. Today-only time changes. Every run is logged (planned minutes, +10s added, launched/done/skipped) for 26 Days.
- **Routines:** picker with Days/Nights ("Duplicate for Night Shift" flips times 12 hours). Optional times; every step is its own row with a NOW highlight. Each step's ⋯: Re-sort, Add timed launch, Add non-negotiable, Remove. Rituals are parked for 26 Days.
- **This Week:** Sunday–Saturday calendar with two-way Google Calendar sync, pastel-neon calendar colours, themes (e.g. CONSISTENCY) shown as a banner. Google events are kept in LaunchPage so the week shows on load; the button is now Sync.
- **Tasks:** the Launch Sheet TO-DO LIST rebuilt. Projects/areas, statuses (Due Today, 3 Key Tasks, In Progress, Appointments, On Deck, Monthly, Annual, Pending, Completed, Recently deleted), steps, ⋯ menu (calendar, create launch, move, remove), import from the Launch Sheet. Completing a task with open steps asks first.
- **Journal:** one headline a day (purple), the theme (carries over) with the date, and any number of check-ins ("✓ CHECK IN #1…") for short reflections at each routine check-in. Days-in-a-row counter. Launch Sheet journal imported from a file delivered to Dan (not kept in the repo).

### Ground rules kept
- Clean-room code in Dan's own repo; nothing from the textbook repo.
- No API keys or service_role key in browser code; Google sign-in runs in the browser with a token only.
- Dan's personal data (tasks, journal, appointments) never goes in the repo; import files go to him directly.

### Supabase scripts (run in order in SQL Editor if not done yet)
0004–0007 · 0009 · 0010 · 0011 journal · 0012 backgrounds · 0013 alarm sounds · 0014 Google events · 0015 journal check-ins · 0016 launch once-time + launch log

### Carried into 26 Days
- Bring rituals back in and link them to the non-negotiables (template currently kept on the device, fed by "Add non-negotiable").
- New routines start from the non-negotiables baseline.
- Use the launch log (+10 minutes, done/skipped) and journal check-ins in the 26 Days log.
- Remove the temporary "Import journal" item from the ⚙ menu once Dan has imported.

### Later
Budget (Module 2), the Planner, Summary, "Invite people" (needs another Google permission), custom domain app.l4unchp4ge.com.
