-- V20-165: Settings › Projects fields: type, description, short name, status, link.
alter table public.projects
  add column if not exists kind text not null default 'personal',
  add column if not exists description text not null default '',
  add column if not exists short_name text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists link text not null default '';
alter table public.projects drop constraint if exists projects_kind_check;
alter table public.projects add constraint projects_kind_check check (kind in ('personal','business'));
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check (status in ('active','paused','archived'));
