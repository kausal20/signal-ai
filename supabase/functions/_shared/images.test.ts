import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractFeedImage, extractOgImage, normalizeImageUrl } from "./images.ts";

Deno.test("normalizeImageUrl: accepts https photos, upgrades http, resolves relative", () => {
  assertEquals(normalizeImageUrl("https://cdn.example.com/a/photo.jpg?w=800"), "https://cdn.example.com/a/photo.jpg?w=800");
  assertEquals(normalizeImageUrl("http://cdn.example.com/photo.jpg"), "https://cdn.example.com/photo.jpg");
  assertEquals(normalizeImageUrl("//cdn.example.com/photo.png"), "https://cdn.example.com/photo.png");
  assertEquals(normalizeImageUrl("/img/hero.jpg", "https://news.example.com/story"), "https://news.example.com/img/hero.jpg");
  assertEquals(normalizeImageUrl("https://cdn.example.com/p.jpg?a=1&amp;b=2"), "https://cdn.example.com/p.jpg?a=1&b=2");
});

Deno.test("normalizeImageUrl: rejects trackers, logos, icons, svg/gif, data URIs and Google-News thumbnails", () => {
  for (const bad of [
    "", null, undefined,
    "data:image/png;base64,AAAA",
    "https://cdn.example.com/tracking-pixel.png",
    "https://cdn.example.com/assets/logo.png",
    "https://cdn.example.com/favicon.ico",
    "https://cdn.example.com/art.svg",
    "https://cdn.example.com/spinner.gif",
    "https://www.gravatar.com/avatar/abc",
    "https://lh3.googleusercontent.com/xyz=s0",
    "https://news.google.com/api/attachments/abc",
    "ftp://cdn.example.com/photo.jpg",
  ]) assertEquals(normalizeImageUrl(bad as string), null, String(bad));
});

Deno.test("extractFeedImage: prefers media:content, then thumbnail, enclosure, inline <img>", () => {
  assertEquals(
    extractFeedImage(`<item><media:content url="https://i.example.com/big.jpg" medium="image" width="1200"/><media:thumbnail url="https://i.example.com/t.jpg"/></item>`),
    "https://i.example.com/big.jpg",
  );
  assertEquals(
    extractFeedImage(`<item><media:thumbnail url="https://i.example.com/t.jpg" width="300"/></item>`),
    "https://i.example.com/t.jpg",
  );
  assertEquals(
    extractFeedImage(`<item><enclosure url="https://i.example.com/e.jpg" type="image/jpeg" length="1"/></item>`),
    "https://i.example.com/e.jpg",
  );
  assertEquals(
    extractFeedImage(`<item><description><![CDATA[<p><img src="https://i.example.com/inline.jpg" width="640"/> text</p>]]></description></item>`),
    "https://i.example.com/inline.jpg",
  );
  // entity-encoded description (very common in RSS 2.0)
  assertEquals(
    extractFeedImage(`<item><description>&lt;img src="https://i.example.com/enc.jpg" /&gt;</description></item>`),
    "https://i.example.com/enc.jpg",
  );
});

Deno.test("extractFeedImage: skips icons, audio enclosures and non-image media", () => {
  assertEquals(extractFeedImage(`<item><media:thumbnail url="https://i.example.com/tiny.jpg" width="48"/></item>`), null);
  assertEquals(extractFeedImage(`<item><enclosure url="https://i.example.com/ep.mp3" type="audio/mpeg"/></item>`), null);
  assertEquals(extractFeedImage(`<item><media:content url="https://i.example.com/v.mp4" medium="video"/></item>`), null);
  assertEquals(extractFeedImage(`<item><title>No image here</title></item>`), null);
});

Deno.test("extractOgImage: og:image beats twitter:image, resolves relative, ignores logos", () => {
  assertEquals(
    extractOgImage(`<head><meta name="twitter:image" content="https://i.example.com/tw.jpg"><meta property="og:image" content="https://i.example.com/og.jpg"></head>`),
    "https://i.example.com/og.jpg",
  );
  assertEquals(
    extractOgImage(`<head><meta content="/media/cover.jpg" property="og:image"></head>`, "https://news.example.com/a/b"),
    "https://news.example.com/media/cover.jpg",
  );
  assertEquals(
    extractOgImage(`<head><meta property="og:image" content="https://i.example.com/site-logo.png"><meta name="twitter:image" content="https://i.example.com/real.jpg"></head>`),
    "https://i.example.com/real.jpg",
  );
  assertEquals(extractOgImage(`<head><title>x</title></head>`), null);
});
