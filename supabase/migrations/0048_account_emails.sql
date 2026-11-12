-- V20-118 (Dan, Nov 12): a second email that signs in to the same account (and counts for anything email-related later).
create table if not exists public.account_emails (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists account_emails_user_id_idx on public.account_emails(user_id);
alter table public.account_emails enable row level security;
create policy "account_emails read own" on public.account_emails for select to authenticated using ((select auth.uid()) = user_id);
create policy "account_emails add own" on public.account_emails for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "account_emails remove own" on public.account_emails for delete to authenticated using ((select auth.uid()) = user_id);

-- An email that already signs in to an account of its own can't be linked to another one.
create or replace function public.account_emails_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users u where lower(u.email) = new.email and u.id <> new.user_id) then
    raise exception 'That email already has its own account.' using errcode = '23505';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = new.email and u.id = new.user_id) then
    raise exception 'That is already your sign-in email.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.account_emails_guard() from public, anon, authenticated;
drop trigger if exists account_emails_guard on public.account_emails;
create trigger account_emails_guard before insert on public.account_emails for each row execute function public.account_emails_guard();
