-- Steps: a task can have steps listed underneath it (each step is its own task row).
alter table public.tasks add column if not exists parent_id uuid references public.tasks (id) on delete cascade;
