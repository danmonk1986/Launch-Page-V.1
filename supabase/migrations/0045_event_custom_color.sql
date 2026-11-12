-- V20-083 (Nov 12): an event's colour can be teal, purple, blue or any colour you choose (#rrggbb).
alter table public.events drop constraint if exists events_color_check;
alter table public.events add constraint events_color_check check (color in ('teal', 'purple', 'blue') or color ~ '^#[0-9a-fA-F]{6}$');
