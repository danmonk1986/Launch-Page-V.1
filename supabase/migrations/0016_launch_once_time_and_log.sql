-- LaunchPage V.1 · Timed launches: a one-day time change, and a log of each run (for 26 Days).
-- Run once in Supabase → SQL Editor, after 0013.

-- "Just this one": a different time for one date, without changing the rest.
alter table public.launches add column if not exists once_time jsonb;   -- {"date":"YYYY-MM-DD","atTime":"HH:MM"}

-- One row per launch per day: when it launched, how long was planned, minutes added with +10, how it ended.
create table if not exists public.launch_log (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  launch_id    uuid not null,
  day          date not null,
  title        text not null default '',
  planned      int not null default 0,     -- minutes allotted
  extra        int not null default 0,     -- minutes added with +10
  outcome      text not null default 'launched',  -- launched, done, skipped
  launched_at  timestamptz,
  finished_at  timestamptz,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, launch_id, day)
);

alter table public.launch_log enable row level security;
drop policy if exists "Read own" on public.launch_log;
drop policy if exists "Create own" on public.launch_log;
drop policy if exists "Update own" on public.launch_log;
drop policy if exists "Delete own" on public.launch_log;
create policy "Read own" on public.launch_log for select using (auth.uid() = user_id);
create policy "Create own" on public.launch_log for insert with check (auth.uid() = user_id);
create policy "Update own" on public.launch_log for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.launch_log for delete using (auth.uid() = user_id);
drop trigger if exists launch_log_touch on public.launch_log;
create trigger launch_log_touch before update on public.launch_log for each row execute function public.touch_updated_at();
