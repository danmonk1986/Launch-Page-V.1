-- V20-181 (Dan, Nov 14): Settings › Projects › Log Productivity. null = by type (Business on, Personal off).
alter table public.projects add column if not exists log_productivity boolean;
