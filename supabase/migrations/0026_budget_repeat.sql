-- LaunchPage V.1 · Budget lines repeat (weekly / monthly / quarterly / annually), Oct 20.
-- Run once in Supabase → SQL Editor, after 0025.
alter table public.budget_lines add column if not exists repeat_rule text;  -- "W:1,4", "M:17", "Q1:15", "A:04-30" (lib/repeat.ts)
