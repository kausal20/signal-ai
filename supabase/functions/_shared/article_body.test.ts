// Deno tests for the pure HTML -> body-text extraction in article_body.ts.
// Pure/offline: exercises extractBodyFromHtml() only — no network.
// The batch-enrichment loop (enrichRawItemsWithBody) and the network fetch
// (fetchArticleBody) are exercised live via the ingestion pipeline; this
// file locks down the extraction heuristic itself.
//
// Run: deno test supabase/functions/_shared/article_body.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractBodyFromHtml } from "./article_body.ts";

const REAL_PARAGRAPH =
  "This is a real sentence of article body text that is long enough to count as prose. ";

function articlePage(paragraphs: string[]): string {
  return `<html><head><title>x</title></head><body>
    <nav>Home About Contact</nav>
    <header>Site Header</header>
    <article>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</article>
    <footer>Copyright 2026</footer>
  </body></html>`;
}

Deno.test("extracts real body text from an <article> tag", () => {
  const html = articlePage([REAL_PARAGRAPH.repeat(4), REAL_PARAGRAPH.repeat(4)]);
  const body = extractBodyFromHtml(html);
  assert(body.length >= 200);
  assert(body.includes("real sentence of article body text"));
});

Deno.test("strips script/style/nav/header/footer content", () => {
  const html = `<html><body>
    <script>var trackingJunk = "should not appear in output";</script>
    <style>.foo { color: red; /* should not appear */ }</style>
    <nav>Nav link should not appear</nav>
    <article>${REAL_PARAGRAPH.repeat(5)}</article>
    <footer>Footer text should not appear</footer>
  </body></html>`;
  const body = extractBodyFromHtml(html);
  assert(!body.includes("trackingJunk"));
  assert(!body.includes("should not appear"));
  assert(body.includes("real sentence"));
});

Deno.test("falls back to paragraph scan when there is no <article> tag", () => {
  const html = `<html><body>
    <div class="content">
      <p>${REAL_PARAGRAPH.repeat(3)}</p>
      <p>${REAL_PARAGRAPH.repeat(3)}</p>
    </div>
  </body></html>`;
  const body = extractBodyFromHtml(html);
  assert(body.length >= 200);
});

Deno.test("drops short boilerplate paragraphs (nav/caption/ad labels)", () => {
  const html = `<html><body>
    <p>Home</p>
    <p>Sponsored</p>
    <p>${REAL_PARAGRAPH.repeat(3)}</p>
  </body></html>`;
  const body = extractBodyFromHtml(html);
  assert(!body.includes("Sponsored"));
  assert(body.includes("real sentence"));
});

Deno.test("returns a short/empty string for a too-thin page (caller rejects it)", () => {
  const html = `<html><body><article><p>Just one short line.</p></article></body></html>`;
  const body = extractBodyFromHtml(html);
  assert(body.length < 200);
});

Deno.test("empty page produces empty body", () => {
  assertEquals(extractBodyFromHtml("<html><body></body></html>"), "");
});

Deno.test("prefers article-tag content over surrounding paragraph noise", () => {
  const html = `<html><body>
    <p>${"Outside noise paragraph that is long enough to pass the length filter test. ".repeat(3)}</p>
    <article><p>${REAL_PARAGRAPH.repeat(5)}</p></article>
  </body></html>`;
  const body = extractBodyFromHtml(html);
  assert(body.includes("real sentence"));
  assert(!body.includes("Outside noise"));
});

Deno.test("decodes HTML entities in extracted body", () => {
  const html = articlePage([("Anthropic &amp; OpenAI compete &#39;fiercely&#39; in the market. ").repeat(6)]);
  const body = extractBodyFromHtml(html);
  assert(body.includes("Anthropic & OpenAI"));
  assert(body.includes("'fiercely'"));
});
