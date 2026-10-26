# LaunchPage → Zaptor · One-page brief

**Owner:** Dan Monk · STARDVST LTD (STARDVST APP SHOP)  ·  **Mantra:** search. create. evolve.

## The problem
Dan works long rotating shifts as an MWD hand on drilling rigs in northeastern Alberta, and runs his own company and side projects around them. Days flip between Days and Nights, the internet and the setting change (rig vs HQ), and the life admin, the projects and the habits all have to keep moving. For years that has run on a Google Sheet (the Launch Sheet) and a paper field book. They work, but they don't remind, launch, sync or carry over by themselves.

## 1 · LaunchPage: a personal self-management system
A web app Dan fully owns that turns the Launch Sheet into one screen to run the day from, on a laptop, iPad or phone.
- **Launch Page:** the active routine as a timeline with NOW, ROCKETS that open the day's tools, timed launches that pop up, open the tabs and apps, and keep time, the week with two-way Google Calendar sync, the 3 key tasks and what's due, and a daily journal with check-ins.
- **Tasks:** the full to-do list by area and project, with steps, statuses, recurring items and links to the calendar and timed launches.
- **26 Days:** the habit and accountability engine: non-negotiables, rituals (with a meditation crawl and journal check-ins), logging, baseline, bounce-back and a Summary of HQ vs MWD, fed by timed launches and the journal.
- **V.2:** Budget and bookkeeping, tied to Tasks and expenses, once V.1 is proven on a full sheet of real use.

**Built to last:** React + TypeScript web app, Supabase with row-level security, Cloudflare hosting, offline-safe saving, cost kept low. Six themes from Synthwave to Damascus. Built one module at a time, tested step by step.

## MVP: the starting point for a customer version
If LaunchPage is ever offered to other people, this is what it starts as. One loop, in this order:
1. **Make a routine:** the day as a timeline (Days/Nights aware), with NOW.
2. **Add timed launches:** at their time a reminder pops; LAUNCH opens the tabs, apps or a ritual and keeps time.
3. **Log productivity:** a timed launch checked off Done logs its time as work blocks, so the log is the proof.
4. **Save rockets:** the tools for each routine, one tap away.
5. **Create the task list:** areas, projects and tasks.
6. **Populate the calendar:** tasks and launches go onto the week, synced with Google Calendar.

Everything else (journal, 26 Days, rituals, summary) builds on that loop.

**V.1 is the foundation, not the management layer.** It's for building the habits and the system that make success repeatable. Managing money comes in V.2.

## 2 · LaunchPage Suite: the B2B direction (reference)
The same building blocks (areas and projects, timed launches, routines, calendars, logs) shaped for a small business: a management suite where a team runs its day, its projects and its books from one LaunchPage. Kept as a reference, not a commitment.

## 3 · Zaptor: the B2C direction (reference)
A mobile app concept fully designed in Dan's 2021 York University UX Design Certificate: GPS discovery of the people and businesses nearby. Where LaunchPage organizes your own day, Zaptor opens it outward to what's around you. Also kept as a reference, not a commitment.

## How they connect
**LaunchPage** proves the core: a system one person actually runs their life on → **LaunchPage Suite** carries it to a team → **Zaptor** carries the "launch" idea to the world nearby. Each step only happens if the one before earns it.

## Where it stands (Oct 18, 2026)
V.1 is the foundation: the Launch Page, Tasks, Journal, 26 Days (with rituals), Budget and Records (Expenses + Invoices) (import the Launch Sheet's BUDGET tab, export it back as CSV, monthly totals four ways) are built and live, and in daily use on shift. Design closed at 6:20 AM, Oct 18 (restore point `restore/v1.0-design-freeze`); changes from here are functional only. Budget syncing with expenses, bank CSVs and draws is V.2. Code: danmonk1986/Launch-Page-V.1 · planned home: app.l4unchp4ge.com.
