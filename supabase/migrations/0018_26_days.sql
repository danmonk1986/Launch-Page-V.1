-- LaunchPage V.1 · 26 Days: Non-Negotiables, day records, logs, quotes and settings.
-- Run once in Supabase → SQL Editor, after 0017. Until then 26 Days saves on this device.

-- The Non-Negotiables list. Removing one archives it, so past days keep their score.
create table if not exists public.d26_nonnegs (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label       text not null default '',
  section     text not null default 'morning',   -- morning, midday, evening
  at_time     text,                               -- "HH:MM" written for Days
  time_from   text,                               -- wake or bed: follows the routine
  log_kind    text,                               -- productivity or activity: ticks from the log
  target      numeric not null default 0,
  per_week    int,
  archived    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per routine day: the mode it was lived in, hand ticks, and the list as it was that day.
create table if not exists public.d26_days (
  id          uuid not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  mode        text not null default 'HQ',
  shift       text not null default 'days',
  ticks       jsonb not null default '[]',
  items       jsonb not null default '[]',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, day)
);

-- Every log: Productivity, Activity, Rest, Food, H2O, Vices. amount × qty is the total.
create table if not exists public.d26_logs (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day         date not null,
  at          timestamptz not null default now(),
  kind        text not null,
  amount      numeric not null default 0,
  qty         numeric not null default 1,
  unit        text not null default '',
  note        text not null default '',
  mode        text not null default 'HQ',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists d26_logs_user_day on public.d26_logs (user_id, day);

create table if not exists public.d26_quotes (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null default '',
  author      text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per user: vice limits and each vice note's remembered weight.
create table if not exists public.d26_config (
  id              uuid not null,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vice_limit_hq   numeric not null default 3,
  vice_limit_mwd  numeric not null default 2,
  vice_weights    jsonb not null default '{}',
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['d26_nonnegs', 'd26_days', 'd26_logs', 'd26_quotes', 'd26_config'] loop
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
