-- 0068 (Dan, Nov 19 · BETA BACKEND "Setup + daily-opens tracking"): which days each account opens the app.
-- One row per account per day (count + first / last time). Only the account itself can read or write it.
-- The privacy statement (V20-352) says: during the beta we count which days you open the app, never what's in your tasks.
create table if not exists public.app_opens (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  opens integer not null default 1,
  primary key (user_id, day)
);
alter table public.app_opens enable row level security;
drop policy if exists "own opens" on public.app_opens;
create policy "own opens" on public.app_opens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The app calls this once per visit: today's row, or +1 to it.
create or replace function public.record_open(p_day date) returns void language sql security invoker set search_path = public as $$
  insert into public.app_opens (user_id, day) values (auth.uid(), p_day)
  on conflict (user_id, day) do update set opens = app_opens.opens + 1, last_at = now();
$$;
revoke all on function public.record_open(date) from public, anon;
grant execute on function public.record_open(date) to authenticated;

-- BETA BACKEND "Drop the launchers view" (V20-001 follow-up): a leftover read-only view of rockets from before the
-- launchers → rockets rename (0056). Nothing reads it. To put it back:
--   create view public.launchers with (security_invoker = true) as
--     select id, user_id, name, note, url, color, routine_ids, sort, created_at, updated_at, hidden from public.rockets;
drop view if exists public.launchers;
