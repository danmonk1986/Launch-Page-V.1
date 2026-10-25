-- LaunchPage V.1.2 · Budget ↔ Tasks links and Expenses (LP-030), Oct 25.
-- BEFORE RUNNING: rerun supabase/backups/snapshot.sql (this changes tasks).
-- Run once in Supabase → SQL Editor, after 0030. Until then links and expenses save on this device.

-- A task can pay one budget line. Plain ids (no foreign keys) so a save that reaches Supabase
-- before the line it points at never fails; the app unlinks when a line is removed.
alter table public.tasks add column if not exists budget_line_id uuid;
create index if not exists tasks_budget_line on public.tasks (budget_line_id);

-- Expenses: what was actually paid (same columns as the Launch Sheet EXPENSES tab).
create table if not exists public.expenses (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project         text not null default '',
  on_date         date not null,
  description     text not null default '',
  method          text not null default '',
  pmt_type        text not null default '',
  category        text not null default '',
  pmt_category    text not null default '',
  amount          numeric(12, 2),
  gst             numeric(12, 2),
  notes           text not null default '',
  budget_line_id  uuid,
  task_id         uuid,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists expenses_user_date on public.expenses (user_id, on_date);
create index if not exists expenses_line on public.expenses (budget_line_id);

alter table public.expenses enable row level security;
drop policy if exists "Read own" on public.expenses;
drop policy if exists "Create own" on public.expenses;
drop policy if exists "Update own" on public.expenses;
drop policy if exists "Delete own" on public.expenses;
create policy "Read own" on public.expenses for select using (auth.uid() = user_id);
create policy "Create own" on public.expenses for insert with check (auth.uid() = user_id);
create policy "Update own" on public.expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.expenses for delete using (auth.uid() = user_id);

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();
