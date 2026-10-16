-- A fourth launcher colour: neon pink.
alter table public.launchers drop constraint if exists launchers_color_check;
alter table public.launchers add constraint launchers_color_check check (color in ('teal', 'purple', 'green', 'pink'));
