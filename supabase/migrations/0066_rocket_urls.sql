-- V20-300 (Dan, Nov 17): a rocket holds every link one block needs. url stays (first link) as a fallback.
-- Applied Nov 17 after backup.rockets_20261117 (28 rows).
alter table public.rockets add column if not exists urls text[] not null default '{}';
update public.rockets set urls = array[url] where coalesce(url, '') <> '' and cardinality(urls) = 0;
