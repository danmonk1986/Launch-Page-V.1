-- LaunchPage · Security hardening from the Supabase advisor (V20-014), Oct 30.
-- Safe to rerun. Nothing changes who can see what: every policy keeps the same rule.
--
-- 1. Row-level security policies called auth.uid() once per row. Wrapping it as (select auth.uid())
--    makes Postgres work it out once per query: same rule, much faster as tables grow.
-- 2. touch_updated_at() gets a fixed search_path, so it can't be pointed at a look-alike now().

do $$
declare
  p record;
  q text;
  c text;
  n int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    -- Wrap bare auth.uid() calls only (leave any already inside a select).
    q := regexp_replace(p.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    c := regexp_replace(p.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    if q is distinct from p.qual and c is distinct from p.with_check then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, q, c);
    elsif q is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    elsif c is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    else
      continue;
    end if;
    n := n + 1;
  end loop;
  raise notice 'Policies updated: %', n;
end $$;

alter function public.touch_updated_at() set search_path = '';
