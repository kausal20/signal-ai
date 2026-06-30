import { Home, Search, Bookmark, Settings, Brain } from "lucide-react";
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
  bookmarkCount = 0,
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-background/90 px-2.5 pb-safe pt-2 backdrop-blur-xl">
      <div className="grid h-[60px] grid-cols-5 gap-1.5">
        <NavItem active={current === "home"} onClick={onHomeClick} to="/" icon={<Home className="h-5 w-5" />} label="Home" />
        <NavItem active={current === "search"} onClick={onSearchClick} to="/?section=search" icon={<Search className="h-5 w-5" />} label="Search" />
        <NavItem active={current === "advisor"} to="/advisor" icon={<Brain className="h-5 w-5" />} label="Advisor" />
        <NavItem
          active={current === "saved"}
          onClick={onSavedClick}
          to="/?section=saved"
          icon={
            <div className="relative">
              <Bookmark className={cn("h-5 w-5", current === "saved" && "fill-current")} />
              {bookmarkCount > 0 && current !== "saved" && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-green px-1 text-[9px] font-bold text-black">
                  {bookmarkCount}
                </span>
              )}
            </div>
          }
          label="Saved"
        />
        <NavItem active={current === "settings"} to="/settings" icon={<Settings className="h-5 w-5" />} label="Settings" />
      </div>
    </nav>
  );
}

function NavItem({ active, onClick, to, icon, label }: {
  active: boolean; onClick?: () => void; to: string; icon: React.ReactNode; label: string;
}) {
  const cls = cn(
    "flex h-12 min-w-0 flex-col items-center justify-center rounded-2xl text-[10px] font-semibold transition-all active:scale-95",
    active
      ? "bg-green text-black shadow-[0_0_22px_hsl(152_72%_48%/0.22)]"
      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
  );
  const content = (
    <>
      <span>{icon}</span>
      <span className="mt-0.5 truncate">{label}</span>
    </>
  );
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{content}</button>;
  return <Link to={to} className={cls}>{content}</Link>;
}
