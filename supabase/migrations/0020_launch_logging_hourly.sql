-- LaunchPage V.1 · Timed launches: what they log when checked off, and an hourly repeat.
-- Run once in Supabase → SQL Editor, after 0019.
alter table public.launches add column if not exists log_kind text;      -- productivity, activity, rest, food, h2o, vices
alter table public.launches add column if not exists log_amount numeric; -- H2O ml, Food kcal, Vice weight
alter table public.launches add column if not exists until_time text;    -- hourly: last hour it pops up ("HH:MM")
alter table public.launches drop constraint if exists launches_repeat_check;
alter table public.launches add constraint launches_repeat_check check (repeat in ('weekly', 'monthly', 'once', 'hourly'));
