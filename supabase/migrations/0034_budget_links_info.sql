-- LaunchPage V.1.2 · Info link on budget lines (V12-037), Oct 28.
-- Run once in Supabase → SQL Editor, after 0033. Until then a line's link saves on this device only
-- (its linked task still keeps the link).
alter table public.budget_lines add column if not exists link text not null default '';
alter table public.budget_lines add column if not exists link_label text not null default '';
