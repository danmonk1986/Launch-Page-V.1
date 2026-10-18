-- LaunchPage V.1 · Beta test requests
-- Visitors on the sign-in page can ask to beta test. Anyone can add a request,
-- but nobody can read the list through the app: Dan reads it in Supabase →
-- Table Editor → beta_requests (or exports it as CSV from there).
-- Run once in Supabase → SQL Editor.

create table if not exists public.beta_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '' check (char_length(name) <= 120),
  email      text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  note       text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- One request per email, whatever the capitalisation.
create unique index if not exists beta_requests_email_key on public.beta_requests (lower(email));

alter table public.beta_requests enable row level security;

-- Insert only: no select, update or delete policies, so the list stays private.
create policy "Anyone can request beta access"
  on public.beta_requests for insert
  to anon, authenticated
  with check (true);
