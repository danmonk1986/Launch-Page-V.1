-- V20-216 (Dan, Nov 14): a log added by hand (Stats › +) is a run with no launch.
-- Snapshot first: backup_20261114_1520.launch_log.
alter table public.launch_log alter column launch_id drop not null;
alter table public.launch_log drop constraint if exists launch_log_time_source_check;
alter table public.launch_log add constraint launch_log_time_source_check
  check (time_source = any (array['timed', 'entered', 'none', 'allotted', 'manual']));
