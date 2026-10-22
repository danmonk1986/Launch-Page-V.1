-- LaunchPage V.1 · Invoices (pre-V2, Oct 22): STARDVST invoices built in the app, with their
-- customers and the business header that prints on every invoice. Each row keeps its fields in
-- `data` (jsonb) so the layout can be fine-tuned without new scripts.
-- Run once in Supabase → SQL Editor, after 0028. Until then invoices save on this device.

do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_customers', 'invoice_profile'] loop
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
    execute format('create policy "Read own" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Create own" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Update own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "Delete own" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
