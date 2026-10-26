-- LaunchPage · ONE-TIME (Oct 25): move the leftover MTH RCR / ANN RCR tasks with no date
-- (Tasks → "Pending (no date)") into Budget, then out of Tasks. Not a feature: run once.
--
--   MTH RCR → Monthly fixed     ANN RCR → Annual
--   Name    → Description ("Wix -" with link WIX SERVICES becomes "Wix - WIX SERVICES")
--   Project → Project           Expense → Amount (when it's a number)
--   Notes   → "From Tasks · <description> · <link name> · <link> · <notes>", so search "From Tasks" finds them
--   No date or repeat is set: give each one its repeat in Budget, then ⋯ → Add a task.
--   The tasks go to Recently deleted (restore from ⋯ for 30 days), not gone for good.
--
-- BEFORE: run supabase/backups/snapshot.sql.
-- Run STEP 1 alone first and check the list. Then run STEP 2. Then reload the app.

-- STEP 1 · PREVIEW (changes nothing)
select t.status, t.task, t.link_label, p.name as project, t.expense, t.description
from public.tasks t
left join public.projects p on p.id = t.project_id
where t.status in ('MTH RCR', 'ANN RCR')
  and coalesce(trim(t.repeat_rule), '') = ''
  and t.deleted_at is null
  and t.parent_id is null
  and t.budget_line_id is null
  and not (t.done and t.cleared)
order by t.status desc, p.name, t.task;

-- STEP 2 · MOVE (select from here to the end and run)
begin;

create temp table moving on commit drop as
select t.*, p.name as project_name,
       row_number() over (partition by t.user_id order by t.status desc, p.name, t.task) as n
from public.tasks t
left join public.projects p on p.id = t.project_id
where t.status in ('MTH RCR', 'ANN RCR')
  and coalesce(trim(t.repeat_rule), '') = ''
  and t.deleted_at is null
  and t.parent_id is null
  and t.budget_line_id is null
  and not (t.done and t.cleared);

insert into public.budget_lines (id, user_id, section, project, on_date, description, method, pmt_type, category, pmt_category, amount, notes, sort, repeat_rule)
select gen_random_uuid(),
       m.user_id,
       case m.status when 'MTH RCR' then 'fixed' else 'annual' end,
       coalesce(regexp_replace(m.project_name, '^STARDVST\s+', '', 'i'), ''),
       null,
       case when trim(m.task) ~ '-$' and coalesce(trim(m.link_label), '') <> ''
            then trim(m.task) || ' ' || trim(m.link_label)
            else trim(m.task) end,
       '',
       case m.status when 'MTH RCR' then 'FIXED' else 'VARIABLE' end,
       '',
       '',
       case when replace(replace(trim(m.expense), '$', ''), ',', '') ~ '^[0-9]+(\.[0-9]+)?$'
            then replace(replace(trim(m.expense), '$', ''), ',', '')::numeric end,
       concat_ws(' · ', 'From Tasks', nullif(trim(m.description), ''), nullif(trim(m.link_label), ''), nullif(trim(m.link), ''), nullif(trim(m.notes), '')),
       coalesce((select max(b.sort) from public.budget_lines b where b.user_id = m.user_id), 0) + m.n,
       null
from moving m;

update public.tasks t
set deleted_at = now()
from moving m
where t.id = m.id;

select count(*) as moved_to_budget from moving;

commit;
