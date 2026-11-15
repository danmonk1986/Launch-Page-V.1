-- V20-229 (Dan, Nov 14): fonts are ROBOT / SPACE / YOURS. YOURS has a name and three picked fonts.
-- Snapshot first: backup_20261114_2110.settings.
alter table public.settings add column if not exists font_custom jsonb;
update public.settings set font_theme = case font_theme when 'zaptor' then 'robot' when 'launch' then 'space' else font_theme end;
alter table public.settings alter column font_theme set default 'space';
