// Deno tests for the Phase 4B connector-dedup helper. Pure/offline.
// Run: deno test supabase/functions/_shared/source_discovery.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveConnectorId, type ExistingConnectorRef } from "./source_discovery.ts";

Deno.test("resolveConnectorId: no existing connectors -> uses the candidate id", () => {
  const id = resolveConnectorId("official_mistral_rss", "https://mistral.ai/rss.xml", []);
  assertEquals(id, "official_mistral_rss");
});

Deno.test("resolveConnectorId: no matching feed url -> uses the candidate id", () => {
  const existing: ExistingConnectorRef[] = [{ source: "official_mistral_github", feedUrl: "https://github.com/mistral.atom" }];
  const id = resolveConnectorId("official_mistral_rss", "https://mistral.ai/rss.xml", existing);
  assertEquals(id, "official_mistral_rss");
});

Deno.test("resolveConnectorId: identical feed url under a different source id -> reuses the existing id (dedup)", () => {
  const existing: ExistingConnectorRef[] = [{ source: "official_mistral", feedUrl: "https://mistral.ai/rss.xml" }];
  const id = resolveConnectorId("official_mistral_blog_rss", "https://mistral.ai/rss.xml", existing);
  assertEquals(id, "official_mistral");
});

Deno.test("resolveConnectorId: candidate id already matches an existing row for the SAME feed -> stable (not treated as its own duplicate)", () => {
  const existing: ExistingConnectorRef[] = [{ source: "official_mistral_rss", feedUrl: "https://mistral.ai/rss.xml" }];
  const id = resolveConnectorId("official_mistral_rss", "https://mistral.ai/rss.xml", existing);
  assertEquals(id, "official_mistral_rss");
});

Deno.test("resolveConnectorId: trims whitespace before comparing feed urls", () => {
  const existing: ExistingConnectorRef[] = [{ source: "official_mistral", feedUrl: "  https://mistral.ai/rss.xml  " }];
  const id = resolveConnectorId("official_mistral_rss", "https://mistral.ai/rss.xml", existing);
  assertEquals(id, "official_mistral");
});

Deno.test("resolveConnectorId: null feedUrl on an existing row never matches", () => {
  const existing: ExistingConnectorRef[] = [{ source: "official_mistral_docs", feedUrl: null }];
  const id = resolveConnectorId("official_mistral_rss", "https://mistral.ai/rss.xml", existing);
  assertEquals(id, "official_mistral_rss");
});

Deno.test("resolveConnectorId: picks the FIRST matching existing connector when multiple somehow share the feed url", () => {
  const existing: ExistingConnectorRef[] = [
    { source: "official_a", feedUrl: "https://x.com/rss.xml" },
    { source: "official_b", feedUrl: "https://x.com/rss.xml" },
  ];
  const id = resolveConnectorId("official_c", "https://x.com/rss.xml", existing);
  assertEquals(id, "official_a");
});
