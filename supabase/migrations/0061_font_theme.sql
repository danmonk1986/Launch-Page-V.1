-- V20-222 (Dan, Nov 14): two font themes in Settings › Appearance. Snapshot first: backup_20261114_2030.settings.
alter table public.settings add column if not exists font_theme text not null default 'launch';
