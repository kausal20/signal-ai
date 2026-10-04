import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { parse } from "@/ui-v2/ask/Markdown";

// Same block parser as the rest of the app (headings, lists, tables, code,
// quotes) — restyled for the editorial system: open typography, no boxes
// except code and tables, green only for links and the one code accent.

const LINK = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${key}b${i}`} className="font-semibold text-ed-text">{m[2]}</strong>);
    else if (m[4]) out.push(<code key={`${key}c${i}`} className="rounded bg-ed-sunken px-1.5 py-0.5 font-mono text-[0.86em] text-ed-text">{m[4]}</code>);
    else if (m[6]) out.push(
      <a key={`${key}l${i}`} href={m[7]} target="_blank" rel="noopener noreferrer" className="font-medium text-ed-accent-ink underline decoration-ed-accent/45 underline-offset-[3px] hover:decoration-ed-accent">
        {m[6]}
      </a>,
    );
    last = m.index + m[0].length; i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-ed-border bg-ed-surface">
      <div className="flex items-center justify-between border-b border-ed-border px-3.5 py-1.5">
        <span className="ed-eyebrow !text-[10.5px]">{lang || "code"}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }, () => {})}
          className="inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-[12px] font-medium text-ed-text-2 transition-colors hover:text-ed-text"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="no-scrollbar overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed"><code className="font-mono text-ed-text">{code}</code></pre>
    </div>
  );
}

function Table({ lines }: { lines: string[] }) {
  const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return (
    <div className="no-scrollbar my-4 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-ed-border-strong">
            {head.map((h, i) => <th key={i} scope="col" className="py-2 pr-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-ed-text-2">{inline(h, `th${i}`)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-ed-border">
              {r.map((c, ci) => <td key={ci} className="py-2.5 pr-4 align-top text-ed-text">{inline(c, `td${ri}${ci}`)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EditorialMarkdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="text-[16px] leading-[1.7] text-ed-text">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "code": return <CodeBlock key={i} lang={b.lang ?? ""} code={b.text ?? ""} />;
          case "table": return <Table key={i} lines={b.lines ?? []} />;
          case "h": {
            const size = b.level === 1 ? "text-[24px]" : b.level === 2 ? "text-[21px]" : "text-[18px]";
            return <h4 key={i} className={`ed-serif mb-2 mt-6 font-semibold leading-snug tracking-[-0.01em] first:mt-0 ${size}`}>{inline(b.text ?? "", `h${i}`)}</h4>;
          }
          case "quote": return <blockquote key={i} className="my-4 border-l-2 border-ed-accent pl-4 text-ed-text-2">{inline(b.text ?? "", `q${i}`)}</blockquote>;
          case "ul": return (
            <ul key={i} className="my-3 space-y-2">
              {(b.lines ?? []).map((l, li) => (
                <li key={li} className="flex gap-3"><span aria-hidden="true" className="mt-[0.72em] h-[5px] w-[5px] shrink-0 rounded-full bg-ed-text-3" /><span>{inline(l, `u${i}${li}`)}</span></li>
              ))}
            </ul>
          );
          case "ol": return (
            <ol key={i} className="my-3 space-y-2">
              {(b.lines ?? []).map((l, li) => (
                <li key={li} className="flex gap-3"><span aria-hidden="true" className="ed-serif ed-numeral w-5 shrink-0 text-ed-text-2">{li + 1}.</span><span>{inline(l, `o${i}${li}`)}</span></li>
              ))}
            </ol>
          );
          default: return <p key={i} className="my-3 first:mt-0">{inline(b.text ?? "", `p${i}`)}</p>;
        }
      })}
    </div>
  );
}
