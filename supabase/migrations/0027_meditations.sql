-- LaunchPage V.1 · Meditation library: write a meditation once, use it in any ritual, edit it anywhere (Oct 20).
-- Run once in Supabase → SQL Editor, after 0026. Until then meditations save on this device.

create table if not exists public.meditations (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '',
  script      text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists meditations_user on public.meditations (user_id, sort);

alter table public.meditations enable row level security;
drop policy if exists "Read own" on public.meditations;
drop policy if exists "Create own" on public.meditations;
drop policy if exists "Update own" on public.meditations;
drop policy if exists "Delete own" on public.meditations;
create policy "Read own" on public.meditations for select using (auth.uid() = user_id);
create policy "Create own" on public.meditations for insert with check (auth.uid() = user_id);
create policy "Update own" on public.meditations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.meditations for delete using (auth.uid() = user_id);
drop trigger if exists meditations_touch on public.meditations;
create trigger meditations_touch before update on public.meditations for each row execute function public.touch_updated_at();
