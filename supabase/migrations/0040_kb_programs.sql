-- LaunchPage · KNOWLEDGE!B4SE programs (Dan, Nov 7): Domain → Program → Course → Deck.
-- A program is a certificate, bootcamp, exam program or degree (UX Design at York U, Le Wagon's
-- Web Development, the CFA Program, an MRU degree). Courses keep their rows; this only adds the level.
-- Safe to rerun. Doesn't touch tasks or budget_lines.
alter table public.kb_courses add column if not exists program text;
alter table public.kb_courses add column if not exists program_sort int not null default 0;
create index if not exists kb_courses_program on public.kb_courses (user_id, domain_sort, program_sort, course_sort);
