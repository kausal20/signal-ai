// Ask Signal: archive-first AI intelligence streaming endpoint.
// Request flow: intent -> Signal archive retrieval -> grounded prompt -> MeshAPI -> SSE.

import { streamContent } from "../_shared/ai_provider.ts";
import { buildGroundedSystem, classifyIntent, fallbackRelatedSuggestions, relatedReading, retrieveGrounding, type AskIntent, type GroundingContext } from "../_shared/ask_intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface Turn { role: string; content: string }
interface AnswerCacheEntry { expiresAt: number; text: string; relatedSuggestions: string[] }
const ANSWER_CACHE_TTL_MS = 10 * 60_000;
const answerCache = new Map<string, AnswerCacheEntry>();
const SUGGESTION_MARKER = "<!-- SIGNAL_RELATED:";
const SUGGESTION_SECTION = "\n## Suggested Follow-ups";

function sseStream(text: string, relatedSuggestions: string[] = []): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
      if (relatedSuggestions.length) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ relatedSuggestions })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function answerCacheKey(question: string, intent: AskIntent, articleIds: string[]): string {
  return `${intent}|${question.trim().toLowerCase()}|${articleIds.join(",")}`;
}

/** For non-conversational repeated summaries/comparisons, cache the completed grounded answer. */
function cacheable(intent: AskIntent, turnCount: number): boolean {
  return turnCount === 1 && (intent === "NEWS_SUMMARY" || intent === "COMPARE");
}

function suggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeSuggestions(value: unknown, turns: Turn[], grounding: GroundingContext): string[] {
  const asked = turns.filter((turn) => turn.role === "user").map((turn) => turn.content);
  const excluded = new Set(asked.map(suggestionKey));
  const unique = new Set<string>();
  const generated = Array.isArray(value) ? value : [];
  const suggestions = generated
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/[\n\r]+/g, " ").replace(/^[-*\d.\s]+/, "").replace(/\s+/g, " ").trim())
    .map((item) => item.length > 50 ? `${item.slice(0, item.slice(0, 50).lastIndexOf(" ") || 50).trim()}…` : item)
    .filter((item) => item.length > 4 && !excluded.has(suggestionKey(item)))
    .filter((item) => {
      const key = suggestionKey(item);
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .slice(0, 2);
  if (suggestions.length === 2) return suggestions;
  return [...suggestions, ...fallbackRelatedSuggestions(turns.at(-1)?.content ?? "", grounding, asked)
    .filter((item) => !unique.has(suggestionKey(item)))].slice(0, 2);
}

function decodePartialJsonString(value: string): string {
  for (let trim = 0; trim <= Math.min(6, value.length); trim++) {
    try { return JSON.parse(`"${value.slice(0, value.length - trim)}"`) as string; } catch { /* try a shorter valid prefix */ }
  }
  return "";
}

function readJsonStringField(payload: string, field: string): { value: string; complete: boolean } | null {
  const fieldIndex = payload.indexOf(`"${field}"`);
  if (fieldIndex < 0) return null;
  const colonIndex = payload.indexOf(":", fieldIndex + field.length + 2);
  const openingQuote = payload.indexOf("\"", colonIndex + 1);
  if (colonIndex < 0 || openingQuote < 0) return null;

  let escaped = false;
  for (let index = openingQuote + 1; index < payload.length; index++) {
    const character = payload[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === "\"") {
      return { value: decodePartialJsonString(payload.slice(openingQuote + 1, index)), complete: true };
    }
  }
  return { value: decodePartialJsonString(payload.slice(openingQuote + 1)), complete: false };
}

function appendRelatedReading(
  source: ReadableStream,
  appendix: string,
  turns: Turn[],
  grounding: GroundingContext,
  onComplete?: (answer: string, relatedSuggestions: string[]) => void,
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const event = (value: unknown) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      let buffer = "";
      let answer = "";
      let marker = "";
      let markerStarted = false;
      let jsonMode = false;
      let jsonPayload = "";
      let providerError = false;
      let completed = false;

      const emitDelta = (delta: string) => {
        if (!delta) return;
        answer += delta;
        controller.enqueue(event({ delta }));
      };

      const consumeDelta = (delta: string) => {
        const jsonCandidate = `${jsonPayload}${delta}`.trimStart();
        if (jsonMode || jsonCandidate.startsWith("{")) {
          jsonMode = true;
          jsonPayload += delta;
          const answerField = readJsonStringField(jsonPayload, "answer");
          if (answerField && answerField.value.startsWith(answer)) emitDelta(answerField.value.slice(answer.length));
          return;
        }
        if (markerStarted) {
          marker += delta;
          return;
        }
        buffer += delta;
        const markerIndexes = [SUGGESTION_MARKER, SUGGESTION_SECTION]
          .map((prefix) => ({ prefix, index: buffer.indexOf(prefix) }))
          .filter((candidate) => candidate.index >= 0)
          .sort((left, right) => left.index - right.index);
        if (markerIndexes.length) {
          const markerStart = markerIndexes[0];
          emitDelta(buffer.slice(0, markerStart.index));
          marker = buffer.slice(markerStart.index);
          buffer = "";
          markerStarted = true;
          return;
        }
        const holdback = Math.max(SUGGESTION_MARKER.length, SUGGESTION_SECTION.length) - 1;
        if (buffer.length > holdback) {
          emitDelta(buffer.slice(0, -holdback));
          buffer = buffer.slice(-holdback);
        }
      };

      const finish = () => {
        if (!providerError) {
          let generated: unknown = [];
          if (jsonMode) {
            try {
              const result = JSON.parse(jsonPayload) as { answer?: unknown; relatedSuggestions?: unknown };
              if (typeof result.answer === "string" && result.answer.startsWith(answer)) emitDelta(result.answer.slice(answer.length));
              generated = result.relatedSuggestions;
            } catch { /* fall back below */ }
          } else {
            if (!markerStarted) emitDelta(buffer);
            const parsed = marker.match(/^<!-- SIGNAL_RELATED:\s*(\[[\s\S]*\])\s*-->\s*$/);
            try {
              generated = parsed
                ? JSON.parse(parsed[1])
                : marker.startsWith(SUGGESTION_SECTION)
                  ? marker.split("\n").map((line) => line.match(/^\s*[-*]\s+(.+)/)?.[1]).filter(Boolean)
                  : [];
            } catch { /* fall back below */ }
          }
          const relatedSuggestions = normalizeSuggestions(generated, turns, grounding);
          controller.enqueue(event({ relatedSuggestions }));
          controller.enqueue(event({ delta: appendix }));
          onComplete?.(answer + appendix, relatedSuggestions);
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = raw.split("\n").find((item) => item.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              finish();
              completed = true;
              return;
            }
            try {
              const parsed = JSON.parse(payload) as { delta?: string; error?: string };
              if (parsed.error) providerError = true;
              if (parsed.delta) consumeDelta(parsed.delta);
              else controller.enqueue(event(parsed));
            } catch {
              // The provider wrapper only emits JSON SSE events; ignore malformed frames.
            }
          }
        }
        if (!completed) finish();
      } catch (error) {
        console.error("[ask-signal] stream transform failed", { message: error instanceof Error ? error.message : String(error) });
        controller.enqueue(event({ error: "stream_error" }));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let messages: Turn[] = [];
  let articleContext: Record<string, unknown> | null = null;
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
    // Ask Signal opened from a Top Story: the article travels with the request so
    // the assistant never has to ask "which article?".
    articleContext = body?.article_context && typeof body.article_context === "object" ? body.article_context : null;
  } catch { /* invalid input becomes the normal empty-message response */ }

  const turns = messages
    .filter((turn) => turn && typeof turn.content === "string" && turn.content.trim())
    .slice(-8);
  const headers = { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };
  if (!turns.length) return new Response(sseStream(JSON.stringify({ error: "empty_message" })), { headers });

  const question = turns.at(-1)!.content.trim();
  const priorQuestion = [...turns.slice(0, -1)].reverse().find((turn) => turn.role === "user")?.content;
  // With a story context, seed retrieval with the headline so even a short first
  // question ("why does this matter?") pulls the right archive + entity evidence.
  const grounding = await retrieveGrounding(
    question,
    priorQuestion ?? (typeof articleContext?.headline === "string" ? articleContext.headline : undefined),
  );
  const ids = grounding.articles.map((article) => article.id);
  const key = answerCacheKey(question, grounding.intent, ids);
  const cached = answerCache.get(key);

  console.info("[ask-signal] archive grounded", {
    intent: grounding.intent,
    entityCount: grounding.entities.length,
    articleCount: grounding.articles.length,
    fallback: grounding.fallback,
    retrievalMs: grounding.retrievalMs,
    cached: Boolean(cached && cached.expiresAt > Date.now()),
  });

  if (cached && cached.expiresAt > Date.now()) return new Response(sseStream(cached.text, cached.relatedSuggestions), { headers });

  // When the conversation was opened from a story, pin that article to the top of
  // the grounded system prompt. Everything else (archive retrieval, entity
  // intelligence, related stories) is the existing pipeline — unchanged.
  const articleBlock = articleContext ? [
    "\nCURRENT ARTICLE (the user opened Ask Signal from this story — assume every question is about it unless they say otherwise):",
    `Headline: ${articleContext.headline ?? ""}`,
    articleContext.summary ? `Summary: ${articleContext.summary}` : "",
    articleContext.publisher ? `Publisher: ${articleContext.publisher}` : "",
    articleContext.published_at ? `Published: ${articleContext.published_at}` : "",
    articleContext.source_type ? `Source type: ${articleContext.source_type}` : "",
    articleContext.event_type ? `Event type: ${articleContext.event_type}` : "",
    articleContext.primary_entity ? `Primary company: ${articleContext.primary_entity}` : "",
    Array.isArray(articleContext.related_entities) && articleContext.related_entities.length
      ? `Related entities: ${(articleContext.related_entities as string[]).join(", ")}` : "",
    articleContext.article_url ? `URL: ${articleContext.article_url}` : "",
    "Never ask the user which article they mean. Ground answers in this article plus the Signal archive below; if something is not supported, say so plainly.",
  ].filter(Boolean).join("\n") : "";

  const providerStream = streamContent({
    feature: "ask-signal",
    systemInstruction: { parts: [{ text: buildGroundedSystem(grounding) + articleBlock }] },
    contents: turns.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] })),
    generationConfig: { temperature: 0.35, maxOutputTokens: 1400, responseMimeType: "application/json" },
  });
  const canCache = cacheable(classifyIntent(question), turns.length);
  const stream = appendRelatedReading(providerStream, relatedReading(grounding.articles), turns, grounding, canCache
    ? (text, relatedSuggestions) => answerCache.set(key, { text, relatedSuggestions, expiresAt: Date.now() + ANSWER_CACHE_TTL_MS })
    : undefined);

  return new Response(stream, { headers });
});
