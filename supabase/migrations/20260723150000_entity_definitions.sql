-- ============================================================================
-- ENTITY INTELLIGENCE LAYER · evergreen entity definitions (Knowledge Graph)
-- ----------------------------------------------------------------------------
-- The Signal AI Overview is generated ENTITY-FIRST from Knowledge Graph metadata
-- — never from article headlines. This seeds canonical, evergreen, Wikipedia-
-- first-paragraph definitions onto the entity rows so the overview describes
-- WHAT THE ENTITY IS and stays accurate months later. Matched by normalized_name
-- (post-dedup, one row each). Overwrites so any prior article-derived text is
-- replaced; bumps updated_at so caches invalidate on metadata change.
-- ============================================================================

-- Cache versioning: overviews regenerate only when the entity metadata changes.
alter table public.entity_overviews
  add column if not exists meta_version timestamptz;

with defs(norm, def) as (values
  ('openai',      'OpenAI is an AI research and deployment company that develops large language models, APIs, and consumer and enterprise AI products, including the ChatGPT assistant and the GPT model family.'),
  ('anthropic',   'Anthropic is an AI safety and research company that develops the Claude family of large language models, with a focus on reliable, interpretable, and steerable AI for consumer and enterprise use.'),
  ('claude',      'Claude is Anthropic''s family of large language models designed for reasoning, coding, document analysis, and enterprise AI applications, available through chat interfaces and an API.'),
  ('chatgpt',     'ChatGPT is OpenAI''s conversational AI assistant built on its GPT large language models, used for writing, coding, analysis, and answering questions across consumer and enterprise plans.'),
  ('gpt',         'GPT is OpenAI''s family of large language models for text generation, reasoning, and coding, accessed through ChatGPT and the OpenAI API.'),
  ('gemini',      'Gemini is Google DeepMind''s family of multimodal large language models for text, image, audio, and code, powering Google''s AI products and available through an API.'),
  ('lovable',     'Lovable is an AI-powered full-stack application builder that lets users create and deploy web applications from natural-language prompts, generating the frontend, backend, and database.'),
  ('cursor',      'Cursor is an AI-powered code editor built on Visual Studio Code that helps developers write, edit, and understand code through integrated AI assistance.'),
  ('perplexity',  'Perplexity is an AI-powered answer engine that responds to natural-language questions with concise, cited answers drawn from real-time web sources.'),
  ('mistral',     'Mistral AI is a European AI company that develops open-weight and commercial large language models for text generation, reasoning, and coding, offered via API and self-hosting.'),
  ('deepseek',    'DeepSeek is an AI company that develops open large language models for reasoning, coding, and general tasks, known for strong performance at low cost.'),
  ('groq',        'Groq is an AI hardware and cloud company that builds LPU inference chips and an API delivering very low-latency execution of large language models.'),
  ('firecrawl',   'Firecrawl is a developer tool that crawls and converts websites into clean, structured data for large language models and AI applications.'),
  ('huggingface', 'Hugging Face is an AI platform and community for sharing machine-learning models, datasets, and applications, and for building and deploying open-source AI.'),
  ('langchain',   'LangChain is an open-source framework for building applications powered by large language models, providing components for chaining prompts, tools, memory, and agents.'),
  ('llama',       'Llama is Meta''s family of open-weight large language models for text and code, released for research and commercial use.'),
  ('grok',        'Grok is xAI''s family of large language models, offered as a conversational assistant integrated with the X platform and through an API.'),
  ('xai',         'xAI is an artificial-intelligence company building advanced AI systems, including the Grok family of large language models and assistant.'),
  ('runway',      'Runway is an applied AI company that develops generative models and creative tools for video, image, and multimedia content generation and editing.'),
  ('elevenlabs',  'ElevenLabs is an AI company specializing in voice technology, offering text-to-speech, voice cloning, and audio generation for creators and developers.'),
  ('midjourney',  'Midjourney is a generative AI service that creates images from natural-language prompts, accessed through a Discord bot and a web app.'),
  ('cohere',      'Cohere is an enterprise AI company that builds large language models and retrieval systems for search, generation, and business applications, offered via API.'),
  ('nvidia',      'NVIDIA is a technology company that designs GPUs and AI computing platforms, providing much of the hardware and software used to train and run AI models.'),
  ('meta',        'Meta is a technology company whose AI division develops the open-weight Llama models and integrates AI assistants across its products.'),
  ('microsoft',   'Microsoft is a technology company that develops AI products and platforms, including its Copilot assistants and Azure AI cloud services.'),
  ('google',      'Google is a technology company whose AI research and products include the Gemini model family, Google DeepMind research, and AI features across its services.'),
  ('googledeepmind','Google DeepMind is Google''s AI research lab that develops the Gemini models and conducts research across reinforcement learning, science, and general AI.'),
  ('deepmind',    'Google DeepMind is Google''s AI research lab that develops the Gemini models and conducts research across reinforcement learning, science, and general AI.'),
  ('replit',      'Replit is a browser-based software development platform with an integrated AI assistant for writing, running, and deploying code.'),
  ('vercel',      'Vercel is a cloud platform for deploying web applications, offering AI tooling including the v0 generative UI product and the AI SDK.'),
  ('v0',          'v0 is Vercel''s generative UI tool that turns natural-language prompts into React user-interface code and components.'),
  ('bolt',        'Bolt is an AI web-development tool that builds and deploys full-stack web applications from natural-language prompts directly in the browser.'),
  ('windsurf',    'Windsurf is an AI-powered code editor that provides autonomous coding assistance and agentic workflows for developers.'),
  ('suno',        'Suno is a generative AI service that creates original songs, including vocals and instrumentation, from text prompts.'),
  ('stability',   'Stability AI is a company that develops open generative models for image, video, audio, and language, including the Stable Diffusion image models.'),
  ('stabilityai', 'Stability AI is a company that develops open generative models for image, video, audio, and language, including the Stable Diffusion image models.'),
  ('mcp',         'The Model Context Protocol (MCP) is an open standard that connects AI assistants to external tools, data sources, and systems through a common interface.'),
  ('crewai',      'CrewAI is an open-source framework for building and orchestrating teams of autonomous AI agents that collaborate to complete multi-step tasks.'),
  ('ollama',      'Ollama is an open-source tool for running large language models locally on personal computers and servers through a simple command-line and API interface.'),
  ('databricks',  'Databricks is a data and AI platform that unifies data engineering, analytics, and machine learning, and develops open large language models.'),
  ('pika',        'Pika is a generative AI service that creates and edits short videos from text and image prompts.'),
  ('qwen',        'Qwen is Alibaba''s family of open large language models for text, code, and multimodal tasks, released for research and commercial use.')
)
update public.entities e
set description = d.def, updated_at = now()
from defs d
where e.normalized_name = d.norm;

-- Force existing overviews to regenerate entity-first (clears any article-derived
-- cache; the fn rebuilds from the seeded metadata on next request).
delete from public.entity_overviews;
