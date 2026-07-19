comment on table public.news_intelligence is
  'Cached AI-generated intelligence per news article. Written only by the news-intelligence edge function (service role).';

comment on table public.ai_pulse_cache is
  'Cached AI-generated industry pulse. Written only by the ai-pulse edge function (service role). Full payload in `pulse`.';
