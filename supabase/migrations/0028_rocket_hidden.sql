-- LaunchPage V.1 · Rockets can be hidden from the Launch Page without deleting them (Oct 20).
-- Run once in Supabase → SQL Editor, after 0027.
alter table public.launchers add column if not exists hidden boolean not null default false;
