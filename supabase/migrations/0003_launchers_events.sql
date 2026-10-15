-- LaunchPage V.1 · L3 launchers + timed launches, L5 calendar events
-- Run once in Supabase → SQL Editor, after 0002.

-- Launch tiles. routine_ids null = shown for every routine (linking comes later).
create table if not exists public.launchers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  note        text not null default '',
  url         text not null default '',
  color       text not null default 'teal' check (color in ('teal', 'purple', 'green')),
  routine_ids uuid[],
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Timed launches: at a set time a reminder pops up; one tap opens every tab.
create table if not exists public.launches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  at_time     text not null,                       -- "HH:MM", 24-hour
  repeat      text not null default 'weekly' check (repeat in ('weekly', 'monthly', 'once')),
  weekdays    int[] not null default '{}',          -- 0 = Sunday … 6 = Saturday (weekly)
  month_day   int,                                  -- 1–31 (monthly)
  on_date     date,                                 -- (once)
  minutes     int not null default 30,
  urls        text[] not null default '{}',
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Calendar events (LaunchPage's own; Google Calendar sync comes later).
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  color       text not null default 'teal' check (color in ('teal', 'purple', 'blue')),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

do $$
declare t text;
begin
  foreach t in array array['launchers', 'launches', 'events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Read own" on public.%I', t);
    execute format('drop policy if exists "Create own" on public.%I', t);
    execute format('drop policy if exists "Update own" on public.%I', t);
    execute format('drop policy if exists "Delete own" on public.%I', t);
    execute format('create policy "Read own" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Create own" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Update own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "Delete own" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
