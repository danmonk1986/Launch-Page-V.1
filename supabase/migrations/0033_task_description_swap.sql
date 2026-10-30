-- LaunchPage V.1.2 · Task ↔ Description swap (V12-032), Oct 28.
-- BEFORE RUNNING: rerun supabase/backups/snapshot.sql (this changes every task).
-- Run in Supabase → SQL Editor, after 0032. Safe to rerun (Oct 30): it marks itself done on the
-- tasks.task column and skips if that mark is there (a second run used to swap everything back).
--
-- Task is now the general one (EOM BILL, Appointment) and Description the specific one (Wix, Dentist).
-- 1. Every task (not steps) swaps the two. Steps keep their name.
-- 2. Tasks linked to a budget line: Description = the line item, Task = the kind of bill:
--    MM BILL (due 8th–23rd), EOM BILL (24th–7th), QTR BILL, ANN BILL, PLAN EXP (one-off), WK BILL.

do $$
begin
  if coalesce(col_description('public.tasks'::regclass, (select attnum from pg_attribute where attrelid = 'public.tasks'::regclass and attname = 'task')), '') like 'migration 0033 applied%' then
    raise notice '0033 already applied: nothing changed.';
    return;
  end if;

  update public.tasks
  set task = description, description = task, updated_at = now()
  where parent_id is null;

  with kind as (
    select b.id,
           b.description,
           upper(coalesce(b.repeat_rule, '')) as r,
           b.section,
           b.on_date
    from public.budget_lines b
  )
  update public.tasks t
  set description = case when k.description <> '' then k.description else t.description end,
      task = case
        when k.r like 'M:%' then
          case
            when substr(k.r, 3) ~ '^\d+($|[^0-9A-Z])' then
              case when (substring(substr(k.r, 3) from '^\d+'))::int between 8 and 23 then 'MM BILL' else 'EOM BILL' end
            when substr(k.r, 3) ~ '^(2ND|3RD)' then 'MM BILL'
            else 'EOM BILL'
          end
        when k.r ~ '^Q\d' then 'QTR BILL'
        when k.r like 'A:%' then 'ANN BILL'
        when k.r like 'W:%' then 'WK BILL'
        -- No repeat: a fixed line with a date repeats on that day; annual is yearly; planned is a one-off.
        when k.section = 'fixed' and k.on_date is not null then
          case when extract(day from k.on_date) between 8 and 23 then 'MM BILL' else 'EOM BILL' end
        when k.section = 'annual' then 'ANN BILL'
        when k.section = 'planned' then 'PLAN EXP'
        else 'EOM BILL'
      end,
      updated_at = now()
  from kind k
  where t.budget_line_id = k.id
    and t.parent_id is null;

  comment on column public.tasks.task is 'migration 0033 applied: Task = general, Description = specific';
  raise notice '0033 applied.';
end $$;
