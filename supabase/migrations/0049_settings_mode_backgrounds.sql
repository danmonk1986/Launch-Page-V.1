-- V20-120: the day and night switch remembers which background each mode uses.
alter table public.settings add column if not exists day_background text, add column if not exists night_background text;
