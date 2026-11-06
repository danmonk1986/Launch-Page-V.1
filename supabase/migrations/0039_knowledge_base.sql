-- LaunchPage · KNOWLEDGE!B4SE (KB-023, Nov 6): the search index over Dan's course decks.
--   kb_courses  Domain → Course, with their order and a source tag (York U, Le Wagon, degree, curated)
--   kb_decks    one row per deck or cheat-sheet canvas (kind 'deck' | 'sheet'), linked to its course
--   kb_slides   one row per slide (or cheat-sheet page): section, eyebrow, title, notes, tags, deep link
-- Rows are written by the extractor (scripts/kb-extract.mjs, run from a Claude chat). The content is
-- Dan's own work, so it lives here and never in the repo. New courses need no code changes.
-- Safe to rerun. Doesn't touch tasks or budget_lines.

create table if not exists public.kb_courses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  domain       text not null,
  course       text not null,
  domain_sort  int not null default 0,
  course_sort  int not null default 0,
  source       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, domain, course)
);

create table if not exists public.kb_decks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id     uuid not null references public.kb_courses (id) on delete cascade,
  kind          text not null default 'deck' check (kind in ('deck', 'sheet')),
  title         text not null,
  url           text not null,
  sort          int not null default 0,
  sections      jsonb not null default '[]'::jsonb,
  slide_count   int not null default 0,
  version       text,
  extracted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, url)
);

create table if not exists public.kb_slides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id       uuid not null references public.kb_decks (id) on delete cascade,
  slide_id      text not null,
  num           int not null,
  section       text not null default '',
  eyebrow       text not null default '',
  title         text not null default '',
  body          text not null default '',
  notes         text not null default '',
  tags          text[] not null default '{}',
  tag_text      text not null default '',
  is_dans_work  boolean not null default false,
  link          text not null,
  fts           tsvector generated always as (
                  setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
                  setweight(to_tsvector('english'::regconfig, coalesce(tag_text, '')), 'A') ||
                  setweight(to_tsvector('english'::regconfig, coalesce(eyebrow, '')), 'B') ||
                  setweight(to_tsvector('english'::regconfig, coalesce(body, '')), 'C') ||
                  setweight(to_tsvector('english'::regconfig, coalesce(notes, '')), 'D')
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (deck_id, slide_id)
);

create index if not exists kb_courses_user on public.kb_courses (user_id, domain_sort, course_sort);
create index if not exists kb_decks_course on public.kb_decks (course_id, sort);
create index if not exists kb_decks_user on public.kb_decks (user_id);
create index if not exists kb_slides_deck on public.kb_slides (deck_id, num);
create index if not exists kb_slides_user on public.kb_slides (user_id);
create index if not exists kb_slides_fts on public.kb_slides using gin (fts);

do $$
declare t text;
begin
  foreach t in array array['kb_courses', 'kb_decks', 'kb_slides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Read own" on public.%I', t);
    execute format('drop policy if exists "Create own" on public.%I', t);
    execute format('drop policy if exists "Update own" on public.%I', t);
    execute format('drop policy if exists "Delete own" on public.%I', t);
    execute format('create policy "Read own" on public.%I for select using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Create own" on public.%I for insert with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Update own" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Delete own" on public.%I for delete using ((select auth.uid()) = user_id)', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Search: every word must match, and the last one matches as a prefix so results show while typing
-- ("pund" finds Pundit). Runs as the caller, so row-level security still decides what's visible.
create or replace function public.kb_search(q text, max_rows int default 80)
returns table (
  slide_uuid uuid, deck_id uuid, slide_id text, num int, section text, eyebrow text, title text,
  snippet text, tags text[], is_dans_work boolean, link text, rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  words text[];
  tsq tsquery;
  src text := '';
  i int;
begin
  words := array(
    select w from regexp_split_to_table(lower(coalesce(q, '')), '[^a-z0-9+#.]+') as w
    where length(regexp_replace(w, '[^a-z0-9]', '', 'g')) > 0
  );
  if coalesce(array_length(words, 1), 0) = 0 then
    return;
  end if;
  for i in 1 .. array_length(words, 1) loop
    words[i] := regexp_replace(words[i], '[^a-z0-9]', '', 'g');
    src := src || case when i > 1 then ' & ' else '' end || quote_literal(words[i]) || ':*';
  end loop;
  begin
    tsq := to_tsquery('english'::regconfig, src);
  exception when others then
    tsq := plainto_tsquery('english'::regconfig, q);
  end;
  if tsq is null or numnode(tsq) = 0 then
    return;
  end if;
  return query
    select s.id, s.deck_id, s.slide_id, s.num, s.section, s.eyebrow, s.title,
           pg_catalog.ts_headline('english'::regconfig,
             case when s.body <> '' then s.body else s.notes end, tsq,
             'MaxFragments=1, MaxWords=24, MinWords=10, StartSel=<<, StopSel=>>'),
           s.tags, s.is_dans_work, s.link,
           pg_catalog.ts_rank(s.fts, tsq)
    from public.kb_slides s
    where s.fts @@ tsq
    order by pg_catalog.ts_rank(s.fts, tsq) desc, s.num
    limit greatest(1, least(max_rows, 300));
end $$;

revoke all on function public.kb_search(text, int) from public, anon;
grant execute on function public.kb_search(text, int) to authenticated;
