-- V12-003 (Nov 12): a run's pause lives on the run, so every device sees it and time spent leaves breaks out.
-- paused_min: minutes paused so far (closed pauses); paused_at: when the current pause started (null = running).
alter table public.launch_log add column if not exists paused_min real not null default 0;
alter table public.launch_log add column if not exists paused_at timestamptz;
