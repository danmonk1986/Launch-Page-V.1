-- V20-084 (Nov 12): event colours are colours 1–4 from Settings (purple, teal, green, pink) or your own #rrggbb.
-- 'blue' stays allowed for older events.
alter table public.events drop constraint if exists events_color_check;
alter table public.events add constraint events_color_check check (color in ('teal', 'purple', 'green', 'pink', 'blue') or color ~ '^#[0-9a-fA-F]{6}$');
