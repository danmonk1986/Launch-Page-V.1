-- 0038 (Nov 2): timed launches that repeat monthly on a weekday ("the first Tuesday").
-- month_week: 1–4 = first…fourth, 5 = last; the weekday is weekdays[0]. Null = by day of the month (month_day).
-- Safe to rerun. Doesn't touch budget_lines or tasks.
alter table public.launches add column if not exists month_week smallint;
