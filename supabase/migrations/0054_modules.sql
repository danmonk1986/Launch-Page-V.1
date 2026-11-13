-- V20-156: MODULES, which Launch Page cards show and whether the routine follows the time.
alter table public.settings add column if not exists modules jsonb;
