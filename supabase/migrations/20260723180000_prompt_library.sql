-- ============================================================================
-- PROMPT LIBRARY · schema + seed + featured / search / analytics RPCs
-- ----------------------------------------------------------------------------
-- Long-lived resource (NOT news). Keyed on slug so seeds are idempotent + safe
-- to rerun. FTS index for fast search. Copy/save/view counters bumped via RPC
-- so we can trend prompts editorially. Public read; only anon writes are
-- through the increment RPC (no arbitrary writes from the client).
-- ============================================================================

create extension if not exists pg_trgm;

create table if not exists public.prompts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text,
  category        text not null,
  tags            text[] not null default '{}'::text[],
  prompt_text     text not null,
  supported_models text[] not null default '{}'::text[],
  difficulty      text not null default 'intermediate'
                  check (difficulty in ('beginner','intermediate','advanced')),
  is_featured     boolean not null default false,
  is_trending     boolean not null default false,
  copy_count      int not null default 0,
  save_count      int not null default 0,
  view_count      int not null default 0,
  rating          numeric(3,2) not null default 4.5,
  fts             tsvector,   -- maintained by trigger (to_tsvector is not IMMUTABLE)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.prompts_fts_trigger() returns trigger language plpgsql as $$
begin
  new.fts :=
      setweight(to_tsvector('english', coalesce(new.title,'')), 'A')
    || setweight(to_tsvector('english', coalesce(new.description,'')), 'B')
    || setweight(to_tsvector('english', coalesce(new.category,'')), 'C')
    || setweight(to_tsvector('english', array_to_string(coalesce(new.tags,'{}'::text[]), ' ')), 'C');
  return new;
end $$;
drop trigger if exists trg_prompts_fts on public.prompts;
create trigger trg_prompts_fts before insert or update on public.prompts
  for each row execute function public.prompts_fts_trigger();

create index if not exists idx_prompts_category    on public.prompts(category);
create index if not exists idx_prompts_featured    on public.prompts(is_featured) where is_featured;
create index if not exists idx_prompts_trending    on public.prompts(copy_count desc, view_count desc);
create index if not exists idx_prompts_fts         on public.prompts using gin(fts);
create index if not exists idx_prompts_title_trgm  on public.prompts using gin(title gin_trgm_ops);

alter table public.prompts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='prompts' and policyname='prompts_read_all') then
    create policy prompts_read_all on public.prompts for select using (true);
  end if;
end $$;

-- ── Analytics: single atomic bump RPC (public callable). Guarded to just the
-- three counter columns so callers can't mutate anything else.
create or replace function public.bump_prompt(p_slug text, p_field text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_field not in ('copy_count','save_count','view_count') then return; end if;
  execute format('update public.prompts set %I = %I + 1, updated_at = now() where slug = $1', p_field, p_field) using p_slug;
end $$;
revoke all on function public.bump_prompt(text, text) from public;
grant execute on function public.bump_prompt(text, text) to anon, authenticated, service_role;

-- ── Featured prompts — used by the Advisor preview and the /prompts page.
create or replace function public.list_featured_prompts(p_limit int default 3)
returns setof public.prompts
language sql stable as $$
  select * from public.prompts
  where is_featured or is_trending
  order by is_featured desc, is_trending desc, copy_count desc, rating desc, created_at desc
  limit greatest(1, p_limit);
$$;

-- ── Prompt search — FTS + trigram, filterable by category. Returns a rank.
create or replace function public.search_prompts(q_raw text default '', p_category text default null, p_limit int default 40)
returns table(
  id uuid, slug text, title text, description text, category text, tags text[],
  supported_models text[], difficulty text, rating numeric, copy_count int,
  is_featured boolean, is_trending boolean, rank real
)
language sql stable as $$
  with q as (
    select nullif(trim(q_raw),'') as raw,
           case when trim(coalesce(q_raw,'')) = '' then null
                else websearch_to_tsquery('english', q_raw) end as ts
  )
  select p.id, p.slug, p.title, p.description, p.category, p.tags,
         p.supported_models, p.difficulty, p.rating, p.copy_count,
         p.is_featured, p.is_trending,
         (
           case when (select ts from q) is null then 0
                else coalesce(ts_rank_cd(p.fts, (select ts from q)), 0) * 100 end
           + case when (select raw from q) is null then 0
                  else greatest(similarity(lower(p.title), lower((select raw from q))),
                                similarity(lower(coalesce(p.description,'')), lower((select raw from q)))) * 40 end
           + case when p.is_featured then 6 else 0 end
           + case when p.is_trending then 4 else 0 end
           + least(20, p.copy_count * 0.1)
           + coalesce(p.rating, 0) * 2
         )::real as rank
  from public.prompts p
  where (p_category is null or p_category = '' or p.category = p_category)
    and (
      (select ts from q) is null
      or p.fts @@ (select ts from q)
      or ((select raw from q) is not null and (
           similarity(lower(p.title), lower((select raw from q))) > 0.2
        or similarity(lower(coalesce(p.description,'')), lower((select raw from q))) > 0.15
      ))
    )
  order by rank desc, p.copy_count desc, p.created_at desc
  limit greatest(1, p_limit);
$$;

-- ── SEED — 15 high-quality prompts across every category. Idempotent by slug.
insert into public.prompts (slug, title, description, category, tags, prompt_text, supported_models, difficulty, is_featured, is_trending, rating) values
('saas-landing-page', 'Build a SaaS Landing Page', 'Generate a complete, conversion-optimized landing page — hero, features, pricing, FAQ.', 'Coding', ARRAY['landing page','saas','marketing','copywriting'],
$$You are a senior product designer + landing-page copywriter. Given a SaaS product description, produce a complete landing page in the following order:

1. HERO — one-line value proposition (<= 12 words), a supporting sentence, a primary CTA.
2. SOCIAL PROOF — a placeholder line for logos + a customer quote pattern.
3. FEATURES — 6 features, each with an icon suggestion, a 4-word title, and a 1-sentence benefit.
4. HOW IT WORKS — 3 numbered steps.
5. PRICING — 3 tiers (Free / Pro / Team) with 5 bullets each, most-popular flag on Pro.
6. FAQ — 6 crisp Q&A pairs.
7. CTA — closing section, one clear next step.

Rules: no marketing hype ("revolutionary", "unlock", "transform"). Concrete verbs. Copy should read at grade 7. Return clean Markdown headings; no preamble.

PRODUCT: {{product_description}}$$,
ARRAY['GPT','Claude','Gemini'], 'intermediate', true, true, 4.9),

('business-strategy', 'Generate Business Strategy', 'Turn a rough startup idea into an operating strategy with market, wedge, moat, GTM.', 'Business', ARRAY['strategy','startup','planning','gtm'],
$$Act as a startup strategist. Take the idea below and return a one-page operating strategy:

1. IDEA (2 sentences the founder can reuse)
2. TARGET USER — the smallest specific segment worth serving first
3. PAIN POINT — what breaks in their week without this product
4. WEDGE — the narrow use case Signal ships in month 1
5. MOAT — what compounds over time (data / network / distribution)
6. GTM — the top-2 acquisition channels with a 30-day test plan for each
7. 90-DAY MILESTONES — 3 measurable outcomes
8. KILL CRITERIA — the leading indicator that says "abandon"

Neutral, evidence-first tone. No hype.

IDEA: {{idea}}$$,
ARRAY['Claude','GPT'], 'intermediate', true, true, 4.8),

('viral-linkedin-post', 'Create Viral LinkedIn Posts', 'Turn any insight into a LinkedIn post structured for reach and reply-rate.', 'Marketing', ARRAY['linkedin','copywriting','social','marketing'],
$$Write a LinkedIn post from the insight below using this structure:

HOOK — one strong sentence that stops the scroll (<= 10 words). Avoid clichés.
CONTEXT — 1-2 sentences of specific situation, not generalities.
BODY — 3-5 short lines. Each line one idea. Break line-by-line, not paragraph.
INSIGHT — the surprising takeaway.
QUESTION — a specific question the reader can answer in a sentence.

Rules: no emojis unless functional, no "🧵", no "here's what I learned", no numbered lists unless the point is a sequence. Sub-200 words. Return plain text.

INSIGHT: {{insight}}$$,
ARRAY['GPT','Claude'], 'beginner', true, false, 4.7),

('fullstack-app', 'Full-Stack App Scaffold', 'Ship a working full-stack MVP scaffold with schema, API, and typed UI.', 'Coding', ARRAY['fullstack','typescript','api','database','mvp'],
$$Act as a senior full-stack engineer. Given the feature description below, produce:

1. DATA MODEL — Postgres schema (CREATE TABLE + indexes + RLS notes).
2. API — REST or RPC surface: method + path + request/response TypeScript types.
3. UI — component tree with one-line responsibility per component.
4. STATE — where each piece of state lives (server / URL / component / global) and why.
5. AUTH — the smallest auth cut that gets to first user.
6. FIRST 3 COMMITS — the sequence to ship a walking skeleton by end of day.

Be concrete. No "consider" or "you might". Use real names.

FEATURE: {{feature_description}}$$,
ARRAY['Claude','GPT'], 'advanced', true, false, 4.9),

('code-review', 'Rigorous Code Review', 'Line-level review focused on bugs, edge cases, and simpler alternatives.', 'Coding', ARRAY['code review','quality','refactor'],
$$Review this code as a senior engineer. Output ONLY findings in this format:

[SEVERITY] file:line — 1-sentence problem. Fix: 1-sentence change.

Severities: BUG > CORRECTNESS > SECURITY > PERFORMANCE > SIMPLIFY > STYLE.

Skip anything you're not sure about. No praise, no summaries, no restating the code. If there are no issues in a section, say nothing about it.

CODE:
{{code}}$$,
ARRAY['Claude','GPT'], 'intermediate', false, true, 4.8),

('cursor-workflow', 'Cursor Agent Workflow', 'Turn a task into a step-by-step Cursor agent plan with checkpoints.', 'Productivity', ARRAY['cursor','agent','workflow','coding'],
$$Convert this task into a Cursor agent workflow:

1. GOAL — 1 sentence.
2. FILES TO READ — list before any edit.
3. STEPS — numbered, each with a specific edit + acceptance check.
4. CHECKPOINT after every 3 steps: what to verify before continuing.
5. ROLLBACK plan.

Never batch unrelated changes. If a step needs new info, add a "clarify" step.

TASK: {{task}}$$,
ARRAY['Claude','GPT'], 'intermediate', false, true, 4.7),

('image-ad', 'Product Ad Image Prompt', 'Prompt for Midjourney / Sora / Imagen — clean product ad, one hero object.', 'Image AI', ARRAY['midjourney','image','ad','product'],
$$Product ad image, single hero object centered, minimalist studio background, soft directional lighting from top-left, 45mm lens, shallow depth-of-field, subtle floor shadow, editorial magazine aesthetic, professional color grading, 4k, ultra-detailed. No text, no watermarks, no clutter.

Product: {{product}}
Background color: {{background_color}}
Mood: {{mood}}$$,
ARRAY['Midjourney','Sora','Imagen','DALL-E'], 'beginner', false, false, 4.6),

('video-explainer', 'Explainer Video Script', 'Script + shotlist for a 60-second explainer video.', 'Video AI', ARRAY['video','script','explainer','runway','sora'],
$$Write a 60-second explainer video script. Return TWO columns per beat:

VO (voiceover, spoken aloud, natural cadence) | SHOT (what the viewer sees, 8-15 words).

Structure:
0:00-0:05  Hook — the pain in one line.
0:05-0:20  Problem — why it happens, made concrete.
0:20-0:45  Solution — 3 steps, one shot per step.
0:45-0:55  Result — a specific before/after.
0:55-1:00  CTA — one action.

Tone: calm, competent, no music cues.

TOPIC: {{topic}}$$,
ARRAY['Sora','Runway','GPT','Claude'], 'intermediate', false, false, 4.5),

('cold-email', 'Cold Email That Gets Replies', 'Short, specific outbound email built for replies.', 'Sales', ARRAY['sales','outbound','email','copywriting'],
$$Write a 90-word cold email using this structure:

SUBJECT — <= 6 words, no "quick question", no "checking in".
LINE 1 — one specific observation about their company (not generic).
LINE 2 — the relevant thing you did for someone like them, with a real metric.
LINE 3 — one-question ask, low commitment, <= 12 words.
SIGN-OFF — first name only.

Never use "hope this finds you well", "just wanted to", "leverage", "synergy", or emojis. Read at grade 6.

PROSPECT CONTEXT: {{prospect_context}}
OFFER: {{offer}}$$,
ARRAY['GPT','Claude'], 'beginner', false, true, 4.7),

('research-summary', 'Research Paper Summary', 'Convert a paper into an engineer-friendly summary + concrete implications.', 'Research', ARRAY['research','papers','arxiv','summarize'],
$$Summarise the paper below in this exact structure:

PROBLEM — 1 sentence, plain English.
APPROACH — 2-3 sentences, how the method works mechanically.
KEY RESULT — the single most important number, with units.
LIMITATIONS — 2 bullets, honestly stated.
FOR ENGINEERS — 3 bullets: how this changes what you would build tomorrow.
SKIP IF — 1 line: who this doesn't help.

No hype, no praise. If the paper doesn't support a claim, say so.

PAPER:
{{paper_text}}$$,
ARRAY['Claude','GPT'], 'advanced', false, false, 4.8),

('brand-voice', 'Define Brand Voice', 'Turn 3 example paragraphs into a reusable brand-voice card.', 'Writing', ARRAY['brand','voice','writing','style'],
$$Analyse the 3 sample paragraphs and produce a brand-voice card:

1. ONE-LINE VOICE — a sentence a writer can hold in their head.
2. DO — 5 concrete patterns (word choice, cadence, structure).
3. DON'T — 5 patterns to avoid.
4. LEXICON — 10 words this brand uses; 10 it never uses.
5. EXAMPLE REWRITE — take this generic sentence "We help teams work smarter." and rewrite it 3 ways in the voice.

SAMPLES:
{{samples}}$$,
ARRAY['Claude','GPT'], 'intermediate', false, false, 4.6),

('automation-workflow', 'n8n / Zapier Workflow', 'Design an end-to-end automation with triggers, steps, and fallbacks.', 'Automation', ARRAY['n8n','zapier','automation','workflow'],
$$Design an automation. Output:

TRIGGER — service + event + polling cadence.
STEPS — numbered, each: service · action · inputs · outputs.
DECISIONS — branch conditions with the exact predicate.
FALLBACKS — what happens on each failure mode (rate limit / auth / bad data).
NOTIFICATIONS — who is told, how, on what condition.
TEST RUN — the minimal payload to validate end-to-end.

Keep it runnable in n8n or Zapier without further guessing.

WORKFLOW: {{workflow_description}}$$,
ARRAY['GPT','Claude'], 'intermediate', false, false, 4.7),

('resume-rewrite', 'Rewrite a Resume Bullet', 'Turn a task-list bullet into an outcome-first, quantified bullet.', 'Career', ARRAY['career','resume','writing'],
$$Rewrite this resume bullet using the STAR-lite format:

<strong verb> <specific thing built> that <measurable outcome> for <who benefited>, using <how / with what>.

Rules: <= 25 words. Real number or percent required. Start with an active verb (never "responsible for"). Preserve every fact — do not invent numbers.

If a number is missing, add a placeholder like "[N]" so the user fills it in.

ORIGINAL BULLET: {{bullet}}$$,
ARRAY['GPT','Claude'], 'beginner', false, false, 4.5),

('lesson-plan', '45-Minute Lesson Plan', 'Structured lesson plan for teaching a technical concept in 45 minutes.', 'Education', ARRAY['education','teaching','lesson'],
$$Design a 45-minute lesson on the topic below. Structure:

0:00-0:05  Hook — a real-world artefact/story that makes the concept feel useful.
0:05-0:15  Explain — the concept in 2 mental models + 1 visual analogy.
0:15-0:30  Do — a small exercise the learner completes hands-on.
0:30-0:40  Debrief — 3 common mistakes + why they happen.
0:40-0:45  Next — the exact next thing the learner should build to keep going.

Assumes prior knowledge: {{prior}}
Topic: {{topic}}$$,
ARRAY['Claude','GPT'], 'intermediate', false, false, 4.6),

('landing-page-copy', 'One-Screen Product Copy', 'A single-screen product description for App Store / Product Hunt.', 'Design', ARRAY['copywriting','design','product'],
$$Write one-screen product copy under 120 words. Structure:

HEADLINE — 6-8 words, benefit-led.
SUB — one sentence, the tangible outcome.
3 BULLETS — each: 2-word feature + 1-line what-you-get.
CTA — 2-word action.

No jargon. No emojis. No hype.

PRODUCT: {{product}}
AUDIENCE: {{audience}}$$,
ARRAY['GPT','Claude'], 'beginner', false, false, 4.6)
on conflict (slug) do update set
  title = excluded.title, description = excluded.description, category = excluded.category, tags = excluded.tags,
  prompt_text = excluded.prompt_text, supported_models = excluded.supported_models,
  difficulty = excluded.difficulty, is_featured = excluded.is_featured, is_trending = excluded.is_trending,
  rating = excluded.rating, updated_at = now();
