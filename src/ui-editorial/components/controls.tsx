import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE, spring, press } from "../motion";
import { Bookmark, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bookmark toggle — the only place the "saved" state is drawn. */
export function SaveButton({ saved, onToggle, title, className }: { saved: boolean; onToggle: () => void; title: string; className?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.12, ease: EASE }}
      aria-pressed={saved}
      aria-label={saved ? `Remove “${title}” from Saved` : `Save “${title}”`}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-ed-sunken active:bg-ed-sunken",
        saved ? "text-ed-accent-ink" : "text-ed-text-3 hover:text-ed-text",
        className,
      )}
    >
      {/* Saving gives a small confirming pop; un-saving just settles. */}
      <motion.span
        initial={false}
        animate={saved ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.34, ease: EASE }}
        className="flex"
      >
        <Bookmark className={cn("h-[20px] w-[20px] transition-[fill] duration-200", saved && "fill-current")} strokeWidth={1.9} aria-hidden="true" />
      </motion.span>
    </motion.button>
  );
}

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean }

/** Small inline overflow menu (no portal, so it inherits the page theme). */
export function RowMenu({ label, items, className }: { label: string; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <motion.button
        {...press}
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ed-text-3 transition-colors hover:bg-ed-sunken hover:text-ed-text"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </motion.button>
      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{ transformOrigin: "top right" }}
          className="absolute right-0 top-full z-20 mt-1 min-w-[210px] rounded-lg border border-ed-border bg-ed-surface py-1 shadow-[0_10px_28px_-14px_rgb(0_0_0/0.28)]"
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); trigger.current?.focus(); it.onSelect(); }}
              className={cn(
                "block min-h-11 w-full px-4 text-left text-[14.5px] transition-colors hover:bg-ed-sunken",
                it.danger ? "text-ed-negative" : "text-ed-text",
              )}
            >
              {it.label}
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

/** On/off switch. Filled with the dark green (accent-ink) when on. */
export function EdSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[28px] w-[48px] shrink-0 rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-ed-accent-ink bg-ed-accent-ink" : "border-ed-border-strong bg-ed-sunken",
      )}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={spring}
        className="absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
      />
    </button>
  );
}

/** Compact segmented choice (e.g. Appearance: Light / Dark / System). */
export function EdSegmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const uid = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-ed-sunken p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={(event) => {
              const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
              if (!keys.includes(event.key)) return;
              event.preventDefault();
              const current = options.findIndex((option) => option.id === o.id);
              const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + options.length) % options.length;
              onChange(options[next].id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
            }}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative h-9 min-w-[64px] rounded-md px-3 text-[13.5px] font-medium transition-colors",
              on ? "font-semibold text-ed-text" : "text-ed-text-2 hover:text-ed-text",
            )}
          >
            {/* The selected surface slides between options. */}
            {on && (
              <motion.span
                layoutId={`ed-seg-${uid}`}
                transition={spring}
                aria-hidden="true"
                className="absolute inset-0 rounded-md border border-ed-border bg-ed-surface"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
