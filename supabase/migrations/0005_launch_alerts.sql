-- Each timed launch decides its own alerts: a chime (start and end) and a desktop notification.
alter table public.launches add column if not exists sound boolean not null default true;
alter table public.launches add column if not exists notify boolean not null default false;
