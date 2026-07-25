// prompt-generate — turns a user's plain-language intent into a professional,
// reusable AI prompt. Uses the shared AI provider; when unavailable, returns a
// structured deterministic prompt template so the feature never dead-ends.
// POST { intent: string, improve?: string } → { ok, prompt }

import { completeChat, isConfigured } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Signal's Prompt Engineer. Turn the user's request into ONE production-grade, reusable AI prompt that another person could paste into ChatGPT/Claude and get an excellent result.
RULES:
- Write the PROMPT ITSELF, addressed to the AI (imperative, "You are …" / "Given … produce …").
- Include a clear role, a numbered output structure, explicit rules/constraints, and {{placeholders}} for the user's variable inputs.
- No preamble, no explanation, no markdown fences. Output ONLY the prompt text.
- Ban hype words. Keep it concrete and evergreen.`;

function deterministicPrompt(intent: string): string {
  const topic = intent.replace(/^i\s+want\s+(a\s+prompt\s+(to|that|for)\s+)?/i, "").replace(/\.$/, "").trim() || "the task";
  return `You are an expert assistant. Your task: ${topic}.

Follow this structure:
1. CLARIFY — restate the goal in one sentence.
2. PLAN — outline the steps you will take.
3. OUTPUT — deliver the result in a clean, structured format with headings.
4. QUALITY CHECK — list what you verified before finishing.

Rules:
- Be concrete and specific; avoid vague filler and marketing language.
- Ask for any missing detail via a short "NEEDS:" line before proceeding.

INPUT: {{input}}
CONTEXT: {{context}}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: any = {}; try { body = await req.json(); } catch { /* */ }
  const intent = String(body?.intent ?? "").slice(0, 600).trim();
  const improve = String(body?.improve ?? "").slice(0, 4000).trim();
  const ok = (p: unknown) => new Response(JSON.stringify(p), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!intent && !improve) return ok({ ok: false, error: "intent required" });

  if (isConfigured()) {
    try {
      const user = improve
        ? `Improve this prompt while keeping its intent. Make it clearer, add structure + placeholders, remove fluff:\n\n${improve}`
        : `Create a prompt for: ${intent}`;
      const res = await completeChat<any>({
        feature: "prompt-generate",
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        timeoutMs: 20_000,
      });
      if (res.success) {
        const raw = String(res.data.choices?.[0]?.message?.content ?? "").replace(/^```[a-z]*\n?|```$/gi, "").trim();
        if (raw.length > 40) return ok({ ok: true, prompt: raw, source: "llm" });
      }
    } catch (e) { console.error("[prompt-generate]", e); }
  }
  return ok({ ok: true, prompt: deterministicPrompt(improve || intent), source: "deterministic" });
});
