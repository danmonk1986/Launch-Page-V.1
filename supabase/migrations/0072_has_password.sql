-- V20-413 (Dan, Nov 19): does the signed-in account have a password yet? (yes / no only; email-link accounts don't)
create or replace function public.has_password()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(encrypted_password, '') <> '' from auth.users where id = auth.uid();
$$;
revoke all on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;
