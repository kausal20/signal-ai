// signal-ui-v2 · ask/Markdown.tsx
// ---------------------------------------------------------------------------
// Lightweight, dependency-free Markdown renderer tuned for Signal AI answers:
// headings, bold, inline code, fenced code blocks (with copy + language badge),
// bullet/numbered lists, blockquotes, links, and tables. Premium dark styling.
// Deliberately small — no external markdown/highlighter deps.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";

// ── Inline formatting: **bold**, `code`, [text](url) ───────────────────────
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${keyBase}-b${i}`} className="font-bold text-foreground">{m[2]}</strong>);
    else if (m[4]) out.push(<code key={`${keyBase}-c${i}`} className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono-tight text-[12.5px] text-green">{m[4]}</code>);
    else if (m[6]) out.push(<a key={`${keyBase}-l${i}`} href={m[7]} target="_blank" rel="noreferrer" className="text-green underline decoration-green/40 underline-offset-2 hover:decoration-green">{m[6]}</a>);
    last = m.index + m[0].length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }, () => {});
  };
  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-white/[0.08] bg-[#05070500]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
        <span className="font-mono-tight text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{lang || "code"}</span>
        <fm.button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          whileTap={reduce ? undefined : { scale: 0.9 }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-green"
        >
          {copied ? <Check className="h-3 w-3 text-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </fm.button>
      </div>
      <pre className="no-scrollbar overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed">
        <code className="font-mono-tight text-foreground/90">{code}</code>
      </pre>
    </div>
  );
}

interface Block {
  type: "h" | "p" | "ul" | "ol" | "quote" | "code" | "table";
  level?: number;
  lang?: string;
  lines?: string[];
  text?: string;
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().replace(/`+/g, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) { buf.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }
    // Table (header row + separator)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const buf: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      blocks.push({ type: "table", lines: buf });
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); i++; continue; }
    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push({ type: "ul", lines: buf });
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      blocks.push({ type: "ol", lines: buf });
      continue;
    }
    // Blank
    if (line.trim() === "") { i++; continue; }
    // Paragraph (gather until blank / block starter)
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*(#{1,4}\s|[-*]\s|\d+\.\s|>\s?|\|)/.test(lines[i]) && !lines[i].trimStart().startsWith("```")) {
      buf.push(lines[i]); i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

function Table({ lines }: { lines: string[] }) {
  const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return (
    <div className="my-2.5 overflow-x-auto rounded-xl border border-white/[0.08]">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-white/[0.04]">
            {header.map((h, i) => <th key={i} className="px-3 py-2 text-left font-bold text-foreground">{renderInline(h, `th${i}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-white/[0.05] transition-colors hover:bg-white/[0.03] odd:bg-white/[0.012]">
              {r.map((c, ci) => <td key={ci} className="px-3 py-2 text-foreground/80">{renderInline(c, `td${ri}-${ci}`)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="text-[14px] leading-relaxed text-foreground/85">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "code": return <CodeBlock key={i} lang={b.lang ?? ""} code={b.text ?? ""} />;
          case "table": return <Table key={i} lines={b.lines ?? []} />;
          case "h": {
            const size = b.level === 1 ? "text-[18px]" : b.level === 2 ? "text-[16px]" : "text-[14.5px]";
            return <div key={i} className={`mb-1.5 mt-3 font-extrabold tracking-[-0.01em] text-foreground first:mt-0 ${size}`}>{renderInline(b.text ?? "", `h${i}`)}</div>;
          }
          case "quote": return <blockquote key={i} className="my-2 border-l-2 border-green/50 pl-3 text-foreground/75">{renderInline(b.text ?? "", `q${i}`)}</blockquote>;
          case "ul": return <ul key={i} className="my-1.5 flex flex-col gap-1">{(b.lines ?? []).map((l, li) => <li key={li} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-green" />{renderInline(l, `ul${i}-${li}`)}</li>)}</ul>;
          case "ol": return <ol key={i} className="my-1.5 flex flex-col gap-1">{(b.lines ?? []).map((l, li) => <li key={li} className="flex gap-2"><span className="mt-0 font-mono-tight text-[12px] font-bold text-green">{li + 1}.</span>{renderInline(l, `ol${i}-${li}`)}</li>)}</ol>;
          default: return <p key={i} className="my-1.5 first:mt-0">{renderInline(b.text ?? "", `p${i}`)}</p>;
        }
      })}
    </div>
  );
}
