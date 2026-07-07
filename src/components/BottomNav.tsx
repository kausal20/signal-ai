import { Home, Search, Bookmark, Compass, SlidersHorizontal } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  activeSection?: "home" | "search" | "advisor" | "saved" | "settings";
  bookmarkCount?: number;
  onHomeClick?: () => void;
  onSearchClick?: () => void;
  onSavedClick?: () => void;
}

export function BottomNav({
  activeSection,
  onHomeClick,
  onSearchClick,
  onSavedClick,
}: Props) {
  const location = useLocation();
  const fallbackActive =
    location.pathname === "/settings" ? "settings"
    : location.pathname === "/advisor" ? "advisor"
    : "home";
  const current = activeSection ?? fallbackActive;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-1.5 pb-safe">
      <div className="mx-auto h-[72px] rounded-t-[28px] border border-b-0 border-white/[0.05] bg-[#020403]/95 px-3 pt-2.5 shadow-[0_-18px_42px_hsl(0_0%_0%/0.55)] backdrop-blur-xl">
        <div className="grid h-full grid-cols-5 items-start">
          <NavItem active={current === "home"} onClick={onHomeClick} to="/" icon={<Home className="h-[21px] w-[21px]" strokeWidth={1.85} />} label="Home" />
          <NavItem active={current === "search"} onClick={onSearchClick} to="/?section=search" icon={<Search className="h-[21px] w-[21px]" strokeWidth={1.95} />} label="Search" />
          <NavItem active={current === "advisor"} to="/advisor" icon={<Compass className="h-[21px] w-[21px]" strokeWidth={1.85} />} label="Advisor" />
          <NavItem
            active={current === "saved"}
            onClick={onSavedClick}
            to="/?section=saved"
            icon={<Bookmark className={cn("h-[21px] w-[21px]", current === "saved" && "fill-current")} strokeWidth={1.85} />}
            label="Saved"
          />
          <NavItem active={current === "settings"} to="/settings" icon={<SlidersHorizontal className="h-[21px] w-[21px]" strokeWidth={1.85} />} label="Settings" />
        </div>
      </div>
    </nav>
  );
}

function NavItem({ active, onClick, to, icon, label }: {
  active: boolean; onClick?: () => void; to: string; icon: React.ReactNode; label: string;
}) {
  const cls = cn(
    "flex min-w-0 flex-col items-center justify-start gap-1 rounded-2xl px-1 py-1 text-[10px] font-medium transition-all active:scale-95",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#020403]",
    active
      ? "text-green"
      : "text-zinc-500 hover:text-foreground"
  );
  const content = (
    <>
      <span className="flex h-6 items-center justify-center">{icon}</span>
      <span className="truncate leading-none">{label}</span>
    </>
  );
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <Link to={to} className={cls}>{content}</Link>;
}
