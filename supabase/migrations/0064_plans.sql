-- V20-253 (Dan, Nov 15): Project Planner plans. A project holds plans (BETA BACKEND, BETA - WEEK 1, ...); a plan
-- holds decisions. New table + one new column; existing decisions are kept and moved into their project's first plan.
-- Snapshot first: backup_20261115_0030.decisions.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null default '',
  description text not null default '',
  start_date date,
  decide_by date,
  notes text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_user_idx on public.plans(user_id);
alter table public.plans enable row level security;
create policy "Read own" on public.plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own" on public.plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own" on public.plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own" on public.plans for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

alter table public.decisions add column if not exists plan_id uuid references public.plans(id) on delete set null;
create index if not exists decisions_plan_idx on public.decisions(plan_id);

-- Every decision already saved goes into a plan called BETA BACKEND under its project (Dan, Nov 15).
with made as (
  insert into public.plans (user_id, project_id, name, sort)
  select distinct user_id, project_id, 'BETA BACKEND', 1 from public.decisions where plan_id is null
  returning id, user_id, project_id
)
update public.decisions d set plan_id = m.id
from made m where d.plan_id is null and d.user_id = m.user_id and d.project_id is not distinct from m.project_id;
