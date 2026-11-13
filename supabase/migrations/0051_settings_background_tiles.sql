-- V20-139: the background check still allowed only the six old names, so saving a new tile (2001, Blue sky, Planets,
-- The Lab, a colour) or your own image was refused. Allow the tile list, the colour tiles and the image slots.
alter table public.settings drop constraint if exists settings_background_check;
alter table public.settings add constraint settings_background_check check (
  background in ('synthwave', 'night', 'planets', 'vats', 'damascus', 'snow', 'corridor', 'starship', 'night-colour', 'day-colour', 'navy', 'white')
  or background ~ '^(day|night)-img-[0-3]$'
);
