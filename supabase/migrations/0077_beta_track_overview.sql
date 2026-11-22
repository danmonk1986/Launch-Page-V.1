-- V20-453 (Dan, Nov 22): BETA TRACKS. The admin's tester list also shows each account's track (launch | books),
-- read from app_metadata.beta_track (set only by the invite-tester function). Same columns as 0069 plus track;
-- the return type changes, so drop and recreate. Old definition saved in backups.function_defs first.
drop function if exists public.admin_beta_overview();
create function public.admin_beta_overview()
 returns table(email text, joined timestamptz, last_sign_in timestamptz, setup text, setup_seconds integer, days_opened bigint, days_7 bigint, last_open timestamptz, track text)
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
  select u.email::text, u.created_at, u.last_sign_in_at,
    coalesce(s.account ->> 'setup', case when coalesce(s.account ->> 'birthday', '') <> '' then 'done' else 'not started' end),
    nullif(s.account ->> 'setupSeconds', '')::integer,
    (select count(*) from public.app_opens o where o.user_id = u.id),
    (select count(*) from public.app_opens o where o.user_id = u.id and o.day > current_date - 7),
    (select max(o.last_at) from public.app_opens o where o.user_id = u.id),
    case when u.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else coalesce(u.raw_app_meta_data ->> 'beta_track', 'launch') end
  from auth.users u
  left join public.settings s on s.user_id = u.id
  where coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  order by u.created_at desc;
$function$;
revoke all on function public.admin_beta_overview() from public, anon;
grant execute on function public.admin_beta_overview() to authenticated;
