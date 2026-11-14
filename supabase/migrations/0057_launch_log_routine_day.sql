-- V20-178 (Nov 13): the routine day a run was finished in (the same day its 26 Days productivity
-- block goes to). launch_log.day stays the launch's calendar slot (it keys the run); Stats buckets
-- hours by routine_day so a 1 AM night block counts on the same day as its block.
alter table public.launch_log add column if not exists routine_day date;
update public.launch_log set routine_day = day where routine_day is null;
