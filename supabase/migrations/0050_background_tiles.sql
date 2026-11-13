-- V20-129 (Dan, Nov 12): Appearance › Background, five tiles per mode. Four backgrounds (any can be swapped for your
-- own image, deleting it brings the default back) and a colour. Images live in their own table so a setting change
-- doesn't send them again.
alter table public.settings add column if not exists night_colour text, add column if not exists day_colour text;
create table if not exists public.background_images (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('day', 'night')),
  slot int not null check (slot between 0 and 3),
  image text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode, slot)
);
alter table public.background_images enable row level security;
create policy "background_images own" on public.background_images for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
