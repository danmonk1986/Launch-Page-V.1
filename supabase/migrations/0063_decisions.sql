-- V20-247 (Dan, Nov 14): Project Planner, the List. A decision belongs to a project; its options sit under it like
-- task steps (jsonb). New table only: no existing data touched.
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default '',
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'deciding', 'waiting', 'decided', 'done')),
  decide_by date,
  who text not null default '',
  cost text not null default '',
  notes text not null default '',
  options jsonb not null default '[]'::jsonb,
  task_id uuid,
  launch_id uuid,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decisions_user_project_idx on public.decisions(user_id, project_id);
alter table public.decisions enable row level security;
create policy "Read own" on public.decisions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own" on public.decisions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own" on public.decisions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own" on public.decisions for delete to authenticated using ((select auth.uid()) = user_id);
drop trigger if exists decisions_touch on public.decisions;
create trigger decisions_touch before update on public.decisions for each row execute function public.touch_updated_at();
