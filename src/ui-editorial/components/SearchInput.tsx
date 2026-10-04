import { useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/** The most important element on the Search page — large, high-contrast edge,
 *  a 2px signal-green focus state. Real <form role="search"> semantics. */
export function SearchInput({ value, onChange, onSubmit, placeholder = "Search stories, companies, technologies", autoFocus, className }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form noValidate
      role="search"
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit?.(value.trim()); }}
      className={cn(
        "flex h-14 items-center gap-3 rounded-xl border border-ed-border-strong bg-ed-surface pl-4 pr-2 transition-colors",
        "focus-within:border-ed-accent focus-within:ring-2 focus-within:ring-ed-accent/25",
        className,
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-ed-text-3" strokeWidth={1.9} aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
        placeholder={placeholder}
        aria-label="Search Signal"
        className="ed-prompt-input min-w-0 flex-1 bg-transparent text-[17px] text-ed-text outline-none placeholder:text-ed-text-3 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => { onChange(""); ref.current?.focus(); }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ed-text-2 transition-colors hover:bg-ed-sunken hover:text-ed-text"
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
