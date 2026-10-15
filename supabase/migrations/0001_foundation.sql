-- LaunchPage V.1 · Step 1.3 foundation
-- One settings row per user. Row Level Security means each person can only
-- read and write their own row, so more users can be added later safely.
-- Run once in Supabase → SQL Editor.

create table if not exists public.settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  logo_text    text not null default '',
  logo_url     text,
  goal         text not null default '',
  mantra       text not null default '',
  background   text not null default 'synthwave'
               check (background in ('synthwave', 'night', 'plain')),
  accent_purple text not null default '#8169af'
               check (accent_purple ~ '^#[0-9a-fA-F]{6}$'),
  accent_teal   text not null default '#76caba'
               check (accent_teal ~ '^#[0-9a-fA-F]{6}$'),
  updated_at   timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "Read own settings"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "Create own settings"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "Update own settings"
  on public.settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_updated_at();
