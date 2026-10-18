-- LaunchPage V.1 · Day mode colours (the light backgrounds get their own four). Run once in Supabase → SQL Editor, after 0020.
alter table public.settings add column if not exists day_purple text not null default '#8169af';
alter table public.settings add column if not exists day_teal   text not null default '#76caba';
alter table public.settings add column if not exists day_green  text not null default '#8fbf7f';
alter table public.settings add column if not exists day_pink   text not null default '#c47aa8';
