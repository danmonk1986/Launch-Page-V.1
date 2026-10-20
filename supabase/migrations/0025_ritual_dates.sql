-- LaunchPage V.1 · Rituals for a set date (e.g. day off starting Nov 12), Oct 20.
-- Run once in Supabase → SQL Editor, after 0024.
alter table public.routines add column if not exists on_dates text[];  -- rituals: "YYYY-MM-DD" days it leads the Rituals card
