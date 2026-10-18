-- LaunchPage V.1 · Budget: the Launch Sheet's BUDGET tab as lines.
-- Run once in Supabase → SQL Editor, after 0022. Until then the budget saves on this device.

create table if not exists public.budget_lines (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section       text not null default 'variable',   -- fixed, variable, annual, planned
  project       text not null default '',
  on_date       date,
  description   text not null default '',
  method        text not null default '',            -- PMT METHOD: ATB, ATB B, MC…
  pmt_type      text not null default '',            -- FIXED or VARIABLE
  category      text not null default '',            -- BUDGET CATEGORY: LIVING, SAVINGS, VICES…
  pmt_category  text not null default '',            -- PMT CATEGORY: RENT, INSURANCE…
  amount        numeric,
  notes         text not null default '',
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists budget_lines_user on public.budget_lines (user_id, sort);

alter table public.budget_lines enable row level security;
drop policy if exists "Read own" on public.budget_lines;
drop policy if exists "Create own" on public.budget_lines;
drop policy if exists "Update own" on public.budget_lines;
drop policy if exists "Delete own" on public.budget_lines;
create policy "Read own" on public.budget_lines for select using (auth.uid() = user_id);
create policy "Create own" on public.budget_lines for insert with check (auth.uid() = user_id);
create policy "Update own" on public.budget_lines for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.budget_lines for delete using (auth.uid() = user_id);
drop trigger if exists budget_lines_touch on public.budget_lines;
create trigger budget_lines_touch before update on public.budget_lines for each row execute function public.touch_updated_at();
