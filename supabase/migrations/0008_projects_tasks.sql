-- LaunchPage V.1 · L4 projects (areas and what's nested under them) and the To-Do list
-- Run once in Supabase → SQL Editor, after 0007.

-- Areas and projects. parent_id null = a top-level area (NORTH STAR, STARDVST LTD …);
-- set = nested under it (StreamVU under APP SHOP, a client under BRAND SHOP).
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null default '#06f9c2',
  parent_id   uuid references public.projects (id) on delete set null,
  calendar_id text,                 -- the Google calendar this area or project adds to
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- To-Do list rows, laid out like the Launch Sheet's TO-DO LIST tab.
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete set null,
  description     text not null default '',
  task            text not null,
  status          text not null default 'PENDING',  -- THREE, WIP, ON DECK, PENDING, MTH RCR, ANN RCR, APPTS, COMPLETE
  link            text not null default '',
  link_label      text not null default '',
  start_date      date,
  end_date        date,                              -- date required
  at_time         text,                              -- "HH:MM"
  repeat_rule     text,                              -- monthly / annual rule, e.g. "1st THU" or "17"
  expense         text not null default '',
  notes           text not null default '',
  done            boolean not null default false,
  done_at         timestamptz,
  cleared         boolean not null default false,       -- done and cleared off the Done list
  google_event_id text,
  launch_id       uuid,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['projects', 'tasks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Read own" on public.%I', t);
    execute format('drop policy if exists "Create own" on public.%I', t);
    execute format('drop policy if exists "Update own" on public.%I', t);
    execute format('drop policy if exists "Delete own" on public.%I', t);
    execute format('create policy "Read own" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Create own" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Update own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "Delete own" on public.%I for delete using (auth.uid() = user_id)', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
