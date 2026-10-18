-- LaunchPage V.1 · Your own background image for night mode and for day mode (resized JPEG, kept with your settings).
-- Run once in Supabase → SQL Editor, after 0021.
alter table public.settings add column if not exists night_bg_image text;
alter table public.settings add column if not exists day_bg_image text;
