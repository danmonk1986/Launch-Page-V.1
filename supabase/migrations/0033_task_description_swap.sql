-- LaunchPage V.1.2 · Task ↔ Description swap (V12-032), Oct 28.
-- BEFORE RUNNING: rerun supabase/backups/snapshot.sql (this changes every task).
-- Run ONCE in Supabase → SQL Editor, after 0032. Running it twice swaps everything back.
--
-- Task is now the general one (EOM BILL, Appointment) and Description the specific one (Wix, Dentist).
-- 1. Every task (not steps) swaps the two. Steps keep their name.
-- 2. Tasks linked to a budget line: Description = the line item, Task = the kind of bill:
--    MM BILL (due 1st–15th), EOM BILL (16th–last), QTR BILL, ANN BILL, PLAN EXP (one-off), WK BILL.

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
          when substr(k.r, 3) ~ '^\d+' then
            case when (substring(substr(k.r, 3) from '^\d+'))::int <= 15 then 'MM BILL' else 'EOM BILL' end
          when substr(k.r, 3) ~ '^(1ST|2ND)' then 'MM BILL'
          else 'EOM BILL'
        end
      when k.r ~ '^Q\d' then 'QTR BILL'
      when k.r like 'A:%' then 'ANN BILL'
      when k.r like 'W:%' then 'WK BILL'
      -- No repeat: a fixed line with a date repeats on that day; annual is yearly; planned is a one-off.
      when k.section = 'fixed' and k.on_date is not null then
        case when extract(day from k.on_date) <= 15 then 'MM BILL' else 'EOM BILL' end
      when k.section = 'annual' then 'ANN BILL'
      when k.section = 'planned' then 'PLAN EXP'
      else 'EOM BILL'
    end,
    updated_at = now()
from kind k
where t.budget_line_id = k.id
  and t.parent_id is null;
