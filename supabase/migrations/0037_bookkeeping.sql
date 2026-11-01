-- LaunchPage · Bookkeeping (V20-015, Nov 1): bank CSV import into Records.
--   bank_accounts  each account number in a statement, named by the user (ATB P., ATB MC, ATB B.)
--   bank_lines     every imported statement line and where it went (expense, draw, income, transfer,
--                  personal, interest): the import history, so a line is never imported twice
--   expense_rules  Common Expenses: how a merchant is documented; the latest confirmed version wins
--   draws          business withdrawals and e-transfers to the owner
-- Each row keeps its fields in `data` (jsonb), like 0029, so columns can be tuned without new scripts.
-- Safe to rerun. Doesn't touch tasks or budget_lines.

do $$
declare t text;
begin
  foreach t in array array['bank_accounts', 'bank_lines', 'expense_rules', 'draws'] loop
    execute format('create table if not exists public.%I (
      id          uuid primary key,
      user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
      data        jsonb not null default ''{}''::jsonb,
      sort        int not null default 0,
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    )', t);
    execute format('create index if not exists %I on public.%I (user_id, sort)', t || '_user', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Read own" on public.%I', t);
    execute format('drop policy if exists "Create own" on public.%I', t);
    execute format('drop policy if exists "Update own" on public.%I', t);
    execute format('drop policy if exists "Delete own" on public.%I', t);
    execute format('create policy "Read own" on public.%I for select using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Create own" on public.%I for insert with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Update own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Delete own" on public.%I for delete using ((select auth.uid()) = user_id)', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
