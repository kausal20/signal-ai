// Prompt Library client service — thin wrapper over the prompt RPCs + edge fn.
// Handles search, featured, saves, recently-used, analytics and generation.
// No business logic on the client beyond copy/track ergonomics.

import { supabase } from "@/integrations/supabase/client";
import { getClientId } from "@/lib/clientId";

export interface Prompt {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  prompt_text?: string;
  supported_models: string[];
  difficulty: string;
  rating: number;
  copy_count: number;
  is_featured?: boolean;
  is_trending?: boolean;
}

export const PROMPT_CATEGORIES = [
  "Coding", "Business", "Marketing", "Writing", "Education", "Productivity",
  "Sales", "Image AI", "Video AI", "Automation", "Career", "Research", "Design",
] as const;

export async function fetchFeatured(limit = 3): Promise<Prompt[]> {
  const { data } = await supabase.rpc("list_featured_prompts", { p_limit: limit });
  return (data ?? []) as Prompt[];
}

export async function searchPrompts(query: string, category: string | null, limit = 40): Promise<Prompt[]> {
  const { data } = await supabase.rpc("search_prompts", {
    q_raw: query ?? "", p_category: category && category !== "all" ? category : null, p_limit: limit,
  });
  if (query.trim()) track(null, "search", query);
  return (data ?? []) as Prompt[];
}

export async function fetchPrompt(slug: string): Promise<Prompt | null> {
  const { data } = await supabase.from("prompts").select("*").eq("slug", slug).maybeSingle();
  return (data as Prompt) ?? null;
}

export async function fetchSaved(): Promise<Prompt[]> {
  const { data } = await supabase.rpc("saved_prompts", { p_client: getClientId(), p_limit: 60 });
  return (data ?? []) as Prompt[];
}

export async function fetchRecent(): Promise<Prompt[]> {
  const { data } = await supabase.rpc("recent_prompts", { p_client: getClientId(), p_limit: 20 });
  return (data ?? []) as Prompt[];
}

export async function isSaved(promptId: string): Promise<boolean> {
  const { data } = await supabase.from("prompt_saves")
    .select("prompt_id").eq("client_id", getClientId()).eq("prompt_id", promptId).maybeSingle();
  return !!data;
}

export async function toggleSave(prompt: Prompt): Promise<boolean> {
  const client = getClientId();
  const saved = await isSaved(prompt.id);
  if (saved) {
    await supabase.from("prompt_saves").delete().eq("client_id", client).eq("prompt_id", prompt.id);
    supabase.rpc("bump_prompt", { p_slug: prompt.slug, p_field: "save_count" }).then(() => {}, () => {});
    track(prompt.id, "unsave");
    return false;
  }
  await supabase.from("prompt_saves").upsert({ client_id: client, prompt_id: prompt.id });
  supabase.rpc("bump_prompt", { p_slug: prompt.slug, p_field: "save_count" }).then(() => {}, () => {});
  track(prompt.id, "save");
  return true;
}

export async function copyPrompt(prompt: Prompt): Promise<boolean> {
  const text = prompt.prompt_text ?? (await fetchPrompt(prompt.slug))?.prompt_text ?? "";
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); } catch { return false; }
  supabase.rpc("bump_prompt", { p_slug: prompt.slug, p_field: "copy_count" }).then(() => {}, () => {});
  track(prompt.id, "copy");
  return true;
}

export function track(promptId: string | null, action: string, query?: string): void {
  supabase.from("prompt_usage").insert({
    client_id: getClientId(), prompt_id: promptId, action, query: query ?? null,
  }).then(() => {}, () => {});
}

export function trackView(prompt: Prompt): void {
  supabase.rpc("bump_prompt", { p_slug: prompt.slug, p_field: "view_count" }).then(() => {}, () => {});
  track(prompt.id, "view");
}

export async function generatePrompt(intent: string, improve?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("prompt-generate", { body: { intent, improve } });
    if (error) return null;
    track(null, "generate", intent);
    return (data?.prompt as string) ?? null;
  } catch { return null; }
}

// Category → emoji (for the premium card chrome; matches the wireframe icons).
export const CATEGORY_ICON: Record<string, string> = {
  Coding: "💻", Business: "💼", Marketing: "📣", Writing: "✍️", Education: "🎓",
  Productivity: "⚡", Sales: "📈", "Image AI": "🎨", "Video AI": "🎬",
  Automation: "🔄", Career: "🧭", Research: "🔬", Design: "🎯",
};
