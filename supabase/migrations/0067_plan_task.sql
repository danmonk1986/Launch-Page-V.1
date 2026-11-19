-- Nov 19 (Dan): one plan = one task. A plan sent to Tasks remembers its task, so sending it again opens that task
-- instead of making a copy; its decisions are that task's steps (decisions.task_id already points at each step).
-- Adds one empty column; no existing data changes. Snapshot first: backup.plans_20261119, backup.decisions_20261119.
alter table public.plans add column if not exists task_id uuid;
