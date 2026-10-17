-- LaunchPage V.1 · Google Calendar events kept in LaunchPage, so the week shows them on load
-- without signing in to Google first. Each sync refreshes them. Run once in Supabase → SQL Editor.
create table if not exists public.gcal_events (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  google_id   text not null,
  calendar_id text not null,
  title       text not null default '',
  start_date  date not null,
  end_date    date not null,
  meta        jsonb not null default '{}'::jsonb,   -- calendar name, colour, time, link, read-only
  synced_at   timestamptz not null default now(),
  unique (user_id, calendar_id, google_id)
);
create index if not exists gcal_events_user_dates on public.gcal_events (user_id, start_date, end_date);

alter table public.gcal_events enable row level security;
drop policy if exists "Read own" on public.gcal_events;
drop policy if exists "Create own" on public.gcal_events;
drop policy if exists "Update own" on public.gcal_events;
drop policy if exists "Delete own" on public.gcal_events;
create policy "Read own" on public.gcal_events for select using (auth.uid() = user_id);
create policy "Create own" on public.gcal_events for insert with check (auth.uid() = user_id);
create policy "Update own" on public.gcal_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.gcal_events for delete using (auth.uid() = user_id);
