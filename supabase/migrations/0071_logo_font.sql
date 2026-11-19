-- V20-372 (Dan, Nov 19): the typed logo's lettering (hand = the L4UNCH P4GE lettering).
alter table public.settings add column if not exists logo_font text not null default 'hand';
