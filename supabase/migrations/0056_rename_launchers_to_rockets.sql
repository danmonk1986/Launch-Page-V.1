-- V12-008 (Nov 13): the app says Rockets, so the table does too.
alter table public.launchers rename to rockets;
-- Old tabs still running the previous build keep working through a view until they're refreshed. Drop it once every device has reloaded.
create view public.launchers with (security_invoker = true) as select * from public.rockets;
grant select, insert, update, delete on public.launchers to authenticated;
