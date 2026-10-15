-- LaunchPage V.1 · L2 routines
-- Routines and Rituals: the basis for the Launch Page (shift line, Today, launchers).
-- Times are stored as written for Days (24-hour "HH:MM"); a routine with flips = true
-- also offers Nights, which moves every time by 12 hours.
-- Run once in Supabase → SQL Editor, after 0001.

create table if not exists public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  kind        text not null default 'routine' check (kind in ('routine', 'ritual')),
  flips       boolean not null default false,
  shift_start text,
  shift_end   text,
  wake        text,
  bed         text,
  items       jsonb not null default '[]'::jsonb,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.routines enable row level security;

create policy "Read own routines"   on public.routines for select using (auth.uid() = user_id);
create policy "Create own routines" on public.routines for insert with check (auth.uid() = user_id);
create policy "Update own routines" on public.routines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own routines" on public.routines for delete using (auth.uid() = user_id);

drop trigger if exists routines_touch on public.routines;
create trigger routines_touch
  before update on public.routines
  for each row execute function public.touch_updated_at();

-- Which routine is active right now (and Days or Nights), kept with the user's settings.
alter table public.settings add column if not exists active_routine_id uuid references public.routines (id) on delete set null;
alter table public.settings add column if not exists active_shift text not null default 'nights' check (active_shift in ('days', 'nights'));
