-- LaunchPage V.1 · Journal mood: one emoji per day. Run once in Supabase → SQL Editor, after 0015.
alter table public.journal add column if not exists mood text not null default '';
