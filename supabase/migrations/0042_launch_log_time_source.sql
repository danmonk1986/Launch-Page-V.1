-- V20-073 (Nov 12): how each run's time was logged, so Stats can tell real hours from entered ones.
-- logged_min: the minutes counted for the run (null = none logged).
-- time_source: 'timed' (▶ / rocket to ✓, pauses taken out) · 'entered' (typed or accepted at the Log the time? prompt)
--              · 'none' (checked off, Don't log) · 'allotted' (the old way: checked off without starting, time allotted).
alter table public.launch_log add column if not exists logged_min integer;
alter table public.launch_log add column if not exists time_source text check (time_source in ('timed', 'entered', 'none', 'allotted'));
