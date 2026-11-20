-- V20-440 (Nov 20): an email that already has an account can't request a beta invite.
create or replace function public.beta_request_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users u where lower(u.email) = lower(trim(new.email))) then
    raise exception 'already has an account' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.beta_request_guard() from public, anon, authenticated;
drop trigger if exists beta_request_guard on public.beta_requests;
create trigger beta_request_guard before insert on public.beta_requests
  for each row execute function public.beta_request_guard();
