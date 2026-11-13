-- V20-146: CARDS + HEADER colours and how solid each is, per mode.
alter table public.settings add column if not exists surfaces jsonb;
