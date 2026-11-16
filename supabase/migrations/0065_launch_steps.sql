-- V20-277 (Dan, Nov 16): steps in a timed launch (names only); Part ticks the ones that got done.
alter table public.launches add column if not exists steps text[] not null default '{}';
