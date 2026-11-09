-- KNOWLEDGE!B4SE: slides open inside LaunchPage (KB-034, Nov 8).
-- Each slide keeps its full design (the slide's own HTML, speaker notes taken out, images inlined), so a
-- finished deck opens in the app's slide viewer instead of on claude.ai. Decks still being built stay
-- links (hosted = false) until they're imported with their slides.
-- The app sanitises the HTML again before showing it. Safe to rerun.
alter table public.kb_slides add column if not exists html text;
alter table public.kb_decks add column if not exists hosted boolean not null default false;
