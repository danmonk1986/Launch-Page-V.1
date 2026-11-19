-- 0069 (Dan, Nov 19): the admin's Beta testers view (⚙ › Beta testers, main only). Summary numbers per account and
-- the invite requests, answered only for a caller whose JWT carries app_metadata.role = 'admin' (set on the server
-- for Dan's account; users can't set app_metadata themselves). Never anyone's tasks, launches or other content.
create or replace function public.admin_beta_overview()
returns table (
  email text, joined timestamptz, last_sign_in timestamptz, setup text, setup_seconds integer,
  days_opened bigint, days_7 bigint, last_open timestamptz
)
language sql stable security definer set search_path = public, auth as $$
  select u.email::text, u.created_at, u.last_sign_in_at,
    coalesce(s.account ->> 'setup', case when coalesce(s.account ->> 'birthday', '') <> '' then 'done' else 'not started' end),
    nullif(s.account ->> 'setupSeconds', '')::integer,
    (select count(*) from public.app_opens o where o.user_id = u.id),
    (select count(*) from public.app_opens o where o.user_id = u.id and o.day > current_date - 7),
    (select max(o.last_at) from public.app_opens o where o.user_id = u.id)
  from auth.users u
  left join public.settings s on s.user_id = u.id
  where coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  order by u.created_at desc;
$$;

create or replace function public.admin_invite_requests()
returns setof public.beta_requests
language sql stable security definer set search_path = public, auth as $$
  select * from public.beta_requests
  where coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  order by created_at desc;
$$;

revoke all on function public.admin_beta_overview() from public, anon;
revoke all on function public.admin_invite_requests() from public, anon;
grant execute on function public.admin_beta_overview() to authenticated;
grant execute on function public.admin_invite_requests() to authenticated;
