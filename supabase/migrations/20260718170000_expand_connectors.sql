-- Expand ingestion coverage — dedicated news sources for long-tail AI companies.
-- ---------------------------------------------------------------------------
-- source_connectors was EMPTY, so ingestion fell back to 5 hardcoded defaults
-- (openai/anthropic/github/hn/arxiv) — the reason niche companies had no
-- dedicated news in the archive. This seeds a broad connector registry:
--   • the special fetchers (github/hn/reddit/arxiv/producthunt/yc)
--   • official company RSS (with Google-News fallback)
--   • broad AI-news RSS (TechCrunch/VentureBeat/The Verge) — catches FUTURE
--     companies generically
--   • per-company Google-News queries for the long-tail (Perplexity, Lovable,
--     Cursor, Firecrawl, Higgsfield, Runway, ElevenLabs, Pika, Replit,
--     LangChain, LlamaIndex, and ~30 more)
-- Every fetched article that passes basic validation lands in content_archive
-- (searchable) regardless of the curated Home cut. Idempotent: ON CONFLICT DO
-- NOTHING so operator customizations are never overwritten. Ingestion reads this
-- table dynamically (loadConnectors) — no function redeploy needed.
--
-- Note: `_news` connectors use Google-News RSS, which serves roughly the last
-- weeks of coverage; deep back-history accrues as the cron keeps ingesting.
-- ---------------------------------------------------------------------------

insert into public.source_connectors
  (source, source_label, source_kind, tier, source_weight, trust_score, rss_url, news_query, enabled)
values
  -- ── Special fetchers (source name must match the connector dispatch) ────────
  ('github',         'GitHub AI projects', 'launch',    'medium', 1.00, 70, null, null, true),
  ('hn',             'Hacker News',        'community', 'medium', 1.02, 76, null, null, true),
  ('reddit',         'Reddit',             'community', 'medium', 0.92, 68, null, null, true),
  ('arxiv',          'arXiv',              'research',  'slow',   1.00, 78, null, null, true),
  ('producthunt',    'Product Hunt',       'launch',    'medium', 0.95, 66, null, null, true),
  ('yc_discussions', 'YC / HN founders',   'startup',   'slow',   1.05, 72, null, null, true),

  -- ── Official company sources (RSS with Google-News fallback) ────────────────
  ('openai',       'OpenAI',       'official', 'fast',   1.55, 95, 'https://openai.com/news/rss.xml',            'OpenAI GPT model release OR ChatGPT', true),
  ('anthropic',    'Anthropic',    'official', 'fast',   1.55, 95, 'https://www.anthropic.com/rss.xml',          'Anthropic Claude model release',       true),
  ('google_ai',    'Google AI',    'official', 'fast',   1.40, 90, 'https://blog.google/technology/ai/rss/',     'Google Gemini DeepMind AI',            true),
  ('meta_ai',      'Meta AI',      'official', 'medium', 1.30, 85, null,                                          'Meta Llama AI',                        true),
  ('microsoft_ai', 'Microsoft AI', 'official', 'medium', 1.30, 85, null,                                          'Microsoft Copilot AI',                 true),
  ('mistral',      'Mistral AI',   'official', 'medium', 1.35, 88, 'https://mistral.ai/news/feed.xml',           'Mistral AI model',                     true),

  -- ── Broad AI-news feeds (generic coverage incl. future companies) ───────────
  ('techcrunch_ai', 'TechCrunch AI', 'community', 'fast',   1.20, 82, 'https://techcrunch.com/category/artificial-intelligence/feed/', 'artificial intelligence startup funding', true),
  ('venturebeat_ai','VentureBeat AI','community', 'fast',   1.15, 80, 'https://venturebeat.com/category/ai/feed/',                     'AI enterprise launch',                    true),
  ('theverge_ai',   'The Verge AI',  'community', 'medium', 1.10, 78, 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'AI product',                          true),

  -- ── Per-company Google-News coverage (long-tail) ────────────────────────────
  ('perplexity_news',   'Perplexity',        'community', 'fast',   1.05, 74, null, 'Perplexity AI',                true),
  ('cursor_news',       'Cursor',            'community', 'fast',   1.05, 74, null, 'Cursor AI code editor Anysphere', true),
  ('deepseek_news',     'DeepSeek',          'community', 'fast',   1.05, 74, null, 'DeepSeek AI model',            true),
  ('huggingface_news',  'Hugging Face',      'community', 'fast',   1.05, 74, null, 'Hugging Face AI',              true),
  ('runway_news',       'Runway',            'community', 'fast',   1.05, 74, null, 'Runway AI video generation',   true),
  ('elevenlabs_news',   'ElevenLabs',        'community', 'fast',   1.05, 74, null, 'ElevenLabs AI voice',          true),
  ('lovable_news',      'Lovable',           'community', 'medium', 1.02, 72, null, 'Lovable AI app builder',       true),
  ('firecrawl_news',    'Firecrawl',         'community', 'medium', 1.02, 72, null, 'Firecrawl AI',                 true),
  ('replit_news',       'Replit',            'community', 'medium', 1.02, 72, null, 'Replit AI agent',              true),
  ('langchain_news',    'LangChain',         'community', 'medium', 1.02, 72, null, 'LangChain',                    true),
  ('llamaindex_news',   'LlamaIndex',        'community', 'medium', 1.02, 72, null, 'LlamaIndex',                   true),
  ('groq_news',         'Groq',              'community', 'medium', 1.02, 72, null, 'Groq AI inference chip',       true),
  ('pika_news',         'Pika',              'community', 'medium', 1.02, 72, null, 'Pika Labs AI video',           true),
  ('suno_news',         'Suno',              'community', 'medium', 1.02, 72, null, 'Suno AI music',                true),
  ('synthesia_news',    'Synthesia',         'community', 'medium', 1.02, 72, null, 'Synthesia AI video avatar',    true),
  ('heygen_news',       'HeyGen',            'community', 'medium', 1.02, 72, null, 'HeyGen AI avatar',             true),
  ('togetherai_news',   'Together AI',       'community', 'medium', 1.02, 72, null, 'Together AI cloud',            true),
  ('cohere_news',       'Cohere',            'community', 'medium', 1.02, 72, null, 'Cohere AI enterprise',         true),
  ('higgsfield_news',   'Higgsfield',        'community', 'slow',   1.00, 70, null, 'Higgsfield AI',                true),
  ('minimax_news',      'MiniMax',           'community', 'slow',   1.00, 70, null, 'MiniMax AI',                   true),
  ('moonshot_news',     'Moonshot AI',       'community', 'slow',   1.00, 70, null, 'Moonshot AI Kimi',             true),
  ('vercelai_news',     'Vercel AI',         'community', 'slow',   1.00, 70, null, 'Vercel AI SDK',                true),
  ('boltnew_news',      'Bolt.new',          'community', 'slow',   1.00, 70, null, 'Bolt.new AI StackBlitz',       true),
  ('luma_news',         'Luma AI',           'community', 'slow',   1.00, 70, null, 'Luma AI Dream Machine',        true),
  ('midjourney_news',   'Midjourney',        'community', 'slow',   1.00, 70, null, 'Midjourney AI image',          true),
  ('stabilityai_news',  'Stability AI',      'community', 'slow',   1.00, 70, null, 'Stability AI image model',     true),
  ('characterai_news',  'Character AI',      'community', 'slow',   1.00, 70, null, 'Character AI chatbot',         true),
  ('pinecone_news',     'Pinecone',          'community', 'slow',   1.00, 70, null, 'Pinecone vector database AI',  true),
  ('replicate_news',    'Replicate',         'community', 'slow',   1.00, 70, null, 'Replicate AI model hosting',   true),
  ('modal_news',        'Modal',             'community', 'slow',   1.00, 70, null, 'Modal Labs AI compute',        true),
  ('ollama_news',       'Ollama',            'community', 'slow',   1.00, 70, null, 'Ollama local AI model',        true),
  ('weightsbiases_news','Weights & Biases',  'community', 'slow',   1.00, 70, null, 'Weights and Biases AI',        true),
  ('xai_news',          'xAI',               'community', 'slow',   1.00, 70, null, 'xAI Grok Elon Musk',           true),
  ('qwen_news',         'Qwen',              'community', 'slow',   1.00, 70, null, 'Qwen Alibaba AI model',        true)
on conflict (source) do nothing;
