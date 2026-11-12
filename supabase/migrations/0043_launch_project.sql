-- V20-074 (Nov 12): a project on each timed launch, copied onto each run when it's checked off,
-- so hours per project hold even if the launch changes later. Deleting a project clears it here.
alter table public.launches add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.launch_log add column if not exists project_id uuid references public.projects(id) on delete set null;
