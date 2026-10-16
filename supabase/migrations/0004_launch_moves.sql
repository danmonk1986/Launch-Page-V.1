-- LaunchPage V.1 · timed launches: "Skip today" moves a repeating launch to tomorrow, same time.
-- Run once in Supabase → SQL Editor, after 0003.
alter table public.launches add column if not exists moved_to date;
