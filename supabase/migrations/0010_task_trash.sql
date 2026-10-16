-- Recently deleted: Remove moves a task here; it can be restored for 30 days.
alter table public.tasks add column if not exists deleted_at timestamptz;
