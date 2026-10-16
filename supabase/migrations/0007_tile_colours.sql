-- The third and fourth launcher colours are picked in Settings, like Purple and Teal.
alter table public.settings add column if not exists accent_green text not null default '#98ee92';
alter table public.settings add column if not exists accent_pink text not null default '#ff6ad5';
