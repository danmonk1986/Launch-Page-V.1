-- LaunchPage V.1.2 · Currency (Oct 25): a budget line or expense priced in another currency keeps
-- its original price (e.g. 15.69 USD) beside the CAD amount that counts in totals.
-- Run once in Supabase → SQL Editor, after 0031. Until then the original price saves on this device.
alter table public.budget_lines add column if not exists currency text;          -- 'USD', 'AUD'… (empty = CAD)
alter table public.budget_lines add column if not exists foreign_amount numeric; -- the price in that currency
alter table public.expenses add column if not exists currency text;
alter table public.expenses add column if not exists foreign_amount numeric;
