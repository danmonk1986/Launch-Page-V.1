-- LaunchPage V.1 · Journal check-ins: several short reflections a day (one per routine check-in).
-- body keeps all of them as plain text too. Run once in Supabase → SQL Editor, after 0011.
alter table public.journal add column if not exists checkins jsonb not null default '[]'::jsonb;
