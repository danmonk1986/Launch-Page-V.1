-- LaunchPage · Snapshot every table (Oct 25, before V.1.2 Budget ↔ Tasks).
-- Run in Supabase → SQL Editor whenever you want a backup. It copies every table in `public`
-- (tasks, budget_lines, routines, d26_*, journal, invoices, launches…) into a new schema named
-- for today, e.g. backup_20261025_0330. The copies sit inside your own database, aren't exposed
-- to the app or the API, and nothing in `public` is changed.
--
-- See your backups:   select schema_name from information_schema.schemata where schema_name like 'backup_%';
-- Restore one table:  truncate public.tasks; insert into public.tasks select * from backup_20261025_0330.tasks;
--                     (only if the table's columns haven't changed since the snapshot)
-- Remove a backup:    drop schema backup_20261025_0330 cascade;

do $$
declare
  snap text := 'backup_' || to_char(now() at time zone 'America/Edmonton', 'YYYYMMDD_HH24MI');
  t record;
  n int := 0;
begin
  execute format('create schema if not exists %I', snap);
  execute format('revoke all on schema %I from anon, authenticated', snap);
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('create table %I.%I as table public.%I', snap, t.table_name, t.table_name);
    n := n + 1;
  end loop;
  raise notice 'Backed up % tables into %', n, snap;
end $$;

-- Row counts in the newest backup, to check it against the app:
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as rows
from information_schema.tables
where table_schema = (select max(schema_name) from information_schema.schemata where schema_name like 'backup_%')
order by table_name;
