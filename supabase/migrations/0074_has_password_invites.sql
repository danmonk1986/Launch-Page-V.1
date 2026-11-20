-- V20-430 (Nov 20): Supabase gives every invited account a hidden random password, so has_password() said "yes" for
-- invitees who never chose one. An invited account only has a password once it's set in the app (pw_set).
create or replace function public.has_password() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(encrypted_password, '') <> ''
     and (invited_at is null or coalesce(raw_user_meta_data->>'pw_set', '') = 'true')
  from auth.users where id = auth.uid();
$$;
