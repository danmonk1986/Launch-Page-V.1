-- LaunchPage V.1 · Six backgrounds: Synthwave, Starry night, Navy (dark) · Damascus, Snowy day, White (light).
-- Plain is retired; anyone on it moves to Navy. Run once in Supabase → SQL Editor.
alter table public.settings drop constraint if exists settings_background_check;
update public.settings set background = 'navy' where background = 'plain';
alter table public.settings add constraint settings_background_check
  check (background in ('synthwave', 'night', 'navy', 'damascus', 'snow', 'white'));
