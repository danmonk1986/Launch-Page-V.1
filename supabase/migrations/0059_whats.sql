-- V20-210 (Dan, Nov 14): the shared What list (settings) and each project's pick (null = all).
alter table public.settings add column if not exists whats jsonb;
alter table public.projects add column if not exists whats text[];
