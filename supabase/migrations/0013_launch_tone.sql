-- LaunchPage V.1 · Timed launches pick their alarm sound. Run once in Supabase → SQL Editor.
alter table public.launches add column if not exists tone text not null default 'chime';
