-- LaunchPage · Off days (V12-043), Nov 1.
-- A 26-day run per calendar month; the rest of the month (days in month − 26) are off days, a
-- planned technology break and reset, marked on any day. An off day counts nowhere: no dip, no
-- streak break, nothing in Missed. Safe to rerun.
alter table public.d26_days add column if not exists off boolean not null default false;
