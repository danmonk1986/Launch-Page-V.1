-- LaunchPage V.1 · L6 Journal: one headline a day, a theme line and an optional page.
-- Run once in Supabase → SQL Editor, after 0010.
create table if not exists public.journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_date  date not null,
  headline    text not null default '',
  theme       text not null default '',
  body        text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists journal_user_date on public.journal (user_id, entry_date desc);

alter table public.journal enable row level security;
drop policy if exists "Read own" on public.journal;
drop policy if exists "Create own" on public.journal;
drop policy if exists "Update own" on public.journal;
drop policy if exists "Delete own" on public.journal;
create policy "Read own" on public.journal for select using (auth.uid() = user_id);
create policy "Create own" on public.journal for insert with check (auth.uid() = user_id);
create policy "Update own" on public.journal for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own" on public.journal for delete using (auth.uid() = user_id);
drop trigger if exists journal_touch on public.journal;
create trigger journal_touch before update on public.journal for each row execute function public.touch_updated_at();
