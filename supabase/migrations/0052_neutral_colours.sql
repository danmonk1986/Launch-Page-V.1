-- V20-144: Neutral (main colour 1), the text colour of each mode.
alter table public.settings add column if not exists day_neutral text, add column if not exists night_neutral text;
