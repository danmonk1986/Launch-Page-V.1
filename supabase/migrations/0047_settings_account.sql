-- V20-113: Account Information (alias, business, role, backup email, age, founded, address) in one column.
alter table public.settings add column if not exists account jsonb not null default '{}'::jsonb;
