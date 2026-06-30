// Centralized signal regexes used across rejection / scoring / boosting.

export const MAJOR_CAPABILITY_RX = /\b(gpt-?5|gpt-?4\.?5|claude|opus|sonnet|haiku|gemini|veo|imagen|llama|mistral|grok|frontier|reasoning|agent|agents|computer use|browser use|voice|real-time|multimodal|long context|code interpreter|tool use|mcp|model release|open weights|api access|general availability|ga)\b/i;
export const BUSINESS_RX = /\b(founder|startup|revenue|sales|marketing|support|customer|funding|series [abc]|acquisition|acquires|partnership|enterprise|workflow|automation|cost|money|pricing|market|opportunity)\b/i;
export const BUILDER_RX = /\b(api|sdk|developer|code|coding|cursor|copilot|agent|workflow|automation|github|open source|self-host|cli|deploy|database|docs|framework|tool)\b/i;
export const RESEARCH_RX = /\b(benchmark|paper|arxiv|research|sota|state of the art|reasoning|training|inference|alignment|multimodal|robotics|evaluation|dataset)\b/i;
export const NOISE_RX = /\b(webinar|podcast|roundup|newsletter|weekly recap|opinion|thought leadership|guide to|ultimate guide|tips and tricks|best practices|sponsored|template pack|prompt pack|course|certificate)\b/i;
export const MINOR_UPDATE_RX = /\b(patch|minor|bug fix|bugfix|maintenance|docs update|documentation update|sdk update|version \d+\.\d+\.\d+|v\d+\.\d+\.\d+|changelog|nightly|alpha release|small update)\b/i;
export const MARKETING_RX = /\b(revolutionary|game-changing|transform your|unlock the power|supercharge|seamless|next-generation|cutting-edge|world-class|all-in-one|ultimate)\b/i;
export const LOW_VALUE_LAUNCH_RX = /\b(ai for (dentists|lawyers|realtors|restaurants|doctors|teachers|students|everyone)|chat with your pdf|pdf chat|summarize youtube|write blogs faster|ai headshot|linkedin post generator)\b/i;

export const PRIORITY_ENTITY_RX = /\b(openai|anthropic|google\s*deepmind|deepmind|meta\s*ai|microsoft\s*ai|copilot|xai|grok|mistral|perplexity|cursor|windsurf|lovable|replit|v0|bolt\.new|runway|elevenlabs|midjourney|suno|pika|luma|n8n|langchain|crewai|autogen|browser\s*use|computer\s*use|mcp|hugging\s*face|nvidia)\b/i;

export const SMALL_FUNDING_RX = /\$\s?([0-9]+(?:\.[0-9]+)?)\s?[mM]\b/;
export const BENCHMARK_ONLY_RX = /\b(beats|tops|leads|scores|achieves)\b.*\b(mmlu|gsm8k|humaneval|swe-?bench|arena|benchmark|leaderboard)\b/i;
export const GITHUB_STARS_RX = /\b(trending|hits|reaches|crosses|surpasses)\b.*\b\d{2,}k?\s*(stars?|forks?)\b/i;
export const PROMPT_PACK_RX = /\b(prompt pack|prompt collection|prompts for|ultimate prompts|best prompts|chatgpt prompts)\b/i;
export const INFRA_ONLY_RX = /\b(cdn|billing|invoice|dashboard redesign|status page|admin panel|terms of service|tos update|privacy policy|sdk update|sdk patch)\b/i;
export const SMALL_WRAPPER_RX = /\b(gpt wrapper|chatgpt wrapper|claude wrapper|ai wrapper for)\b/i;
export const ACADEMIC_NO_USE_RX = /\b(survey|position paper|theoretical|formalism|lemma|theorem)\b/i;

export const BANNED_HEADLINE_WORDS = /\b(revolutionary|game[- ]changing|seamless|supercharge|unlock|transform|next[- ]gen|cutting[- ]edge|world[- ]class|paradigm|disrupt|leverage|harness|empower|unprecedented|breakthrough(ly)?|insanely|crazy|wild|mind[- ]blowing|gamechanger)\b/i;
export const BANNED_HEADLINE_LEAD = /^(how|why|the|a|an|introducing|announcing|meet|say hello)\b/i;
export const VAGUE_AUDIENCE = /^(everyone|anyone|all (ai )?(builders?|users?|people)|people interested|tech enthusiasts?|the world|users|developers|builders|operators|founders|creators)$/i;
export const WEAK_OPPORTUNITY = /^(consider|think about|explore|stay (ahead|tuned|informed)|learn (more|about)|read|check (it )?out|watch|see|note|keep an eye|be aware|understand|look into|investigate)\b/i;
export const PURE_REPO_SLUG = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
