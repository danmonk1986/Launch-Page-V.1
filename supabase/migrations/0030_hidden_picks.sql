-- LaunchPage V.1 · Hidden picks: the ✕ beside a description in a dropdown hides it from that list (Oct 24).
-- The logs, launches and budget lines that used it are untouched.
-- Run once in Supabase → SQL Editor, after 0029. Until then hidden picks save on this device.

create table if not exists public.hidden_picks (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list        text not null default '',
  value       text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hidden_picks_user on public.hidden_picks (user_id, list);

alter table public.hidden_picks enable row level security;
drop policy if exists "Read own" on public.hidden_picks;
drop policy if exists "Create own" on public.hidden_picks;
drop policy if exists "Update own" on public.hidden_picks;
drop policy if exists "Delete own" on public.hidden_picks;
create policy "Read own" on public.hidden_picks for select using (auth.uid() = user_id);
create policy "Create own" on public.hidden_picks for insert with check (auth.uid() = user_id);
create policy "Update own" on public.hidden_picks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.hidden_picks for delete using (auth.uid() = user_id);
drop trigger if exists hidden_picks_touch on public.hidden_picks;
create trigger hidden_picks_touch before update on public.hidden_picks for each row execute function public.touch_updated_at();
