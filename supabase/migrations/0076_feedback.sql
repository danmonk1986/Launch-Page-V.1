-- V20-446 (Nov 20): beta feedback. Testers can only add their own; only the admin reads it and changes its status.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  kind text not null default 'flag' check (kind in ('flag','setup')),
  hangup text,
  words text,
  feeling smallint check (feeling between 1 and 5),
  page text,
  device jsonb,
  app_build text,
  setup_seconds integer,
  status text not null default 'new' check (status in ('new','seen','fixed')),
  bug_ref text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy "Testers add their own feedback" on public.feedback for insert to authenticated with check (user_id = auth.uid());
create policy "Admin reads feedback" on public.feedback for select to authenticated using ((auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admin updates feedback" on public.feedback for update to authenticated using ((auth.jwt()->'app_metadata'->>'role') = 'admin') with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');
create or replace function public.feedback_fill_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.email := (select u.email from auth.users u where u.id = auth.uid());
  new.status := 'new';
  new.bug_ref := null;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.feedback_fill_email() from public, anon, authenticated;
create trigger feedback_fill_email before insert on public.feedback for each row execute function public.feedback_fill_email();
create index feedback_created_idx on public.feedback (created_at desc);
