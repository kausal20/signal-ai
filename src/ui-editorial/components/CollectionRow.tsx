import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { itemV, press } from "../motion";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  count: number;
  active?: boolean;
  onSelect: () => void;
}

/** "AI Tools ........ 12" — a typographic list row, no colourful tiles. */
export function CollectionRow({ label, count, active, onSelect }: Props) {
  return (
    <motion.li variants={itemV} className="border-b border-ed-border">
      <motion.button
        {...press}
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-h-[56px] w-full items-center gap-3 py-3 text-left transition-colors active:bg-ed-sunken"
      >
        <span className={cn("ed-serif flex-1 text-[20px] leading-tight tracking-[-0.005em]", active ? "font-semibold text-ed-text" : "font-medium text-ed-text")}>
          {label}
        </span>
        <span className="ed-numeral text-[15px] text-ed-text-2">{count}</span>
        <ChevronRight className="h-4 w-4 text-ed-text-3" aria-hidden="true" />
      </motion.button>
    </motion.li>
  );
}
