-- LaunchPage V.1 · Timed launches on a few picked dates (Once + more dates), Oct 20.
-- Run once in Supabase → SQL Editor, after 0023.
alter table public.launches add column if not exists more_dates text[];  -- extra "YYYY-MM-DD" dates for a Once launch
