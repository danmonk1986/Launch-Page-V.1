-- LaunchPage V.1 · A timed launch can open a ritual (26 Days). Run once in Supabase → SQL Editor, after 0018.
alter table public.launches add column if not exists ritual_id uuid;
