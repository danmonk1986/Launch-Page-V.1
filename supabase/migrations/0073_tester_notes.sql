-- V20-415 (Dan, Nov 19): Dan's own notes on beta testers (admin only; no table policies, only these functions).
create table public.tester_notes (email text primary key, note text not null default '', updated_at timestamptz not null default now());
alter table public.tester_notes enable row level security;
-- admin_tester_notes() / admin_set_tester_note(text, text): see the applied migration 'tester_notes'.
