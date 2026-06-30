import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

interface Props {
  lastUpdated?: string | null;
  loading?: boolean;
}

export function Header({ lastUpdated, loading }: Props) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem("signal:userName")?.trim() ?? "";
    setUserName(savedName);

    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const greeting = (() => {
    const h = currentTime.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const updatedText = (() => {
    if (loading) return "Updating...";
    if (!lastUpdated) return "Loading...";
    const mins = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000);
    if (mins < 1) return "Updated just now";
    if (mins < 60) return `Updated ${mins}m ago`;
    return `Updated ${Math.round(mins / 60)}h ago`;
  })();

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-background/80 backdrop-blur-xl">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          <Link to="/" className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-foreground leading-none">Signal</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-75" style={{ animation: "pulse-dot 2s ease-in-out infinite" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green" />
              </span>
              {updatedText}
            </span>
          </Link>
        </div>

        <div className="pb-4 -mt-1">
          <p className="text-lg font-bold text-foreground sm:text-2xl">
            {greeting}
            {userName && <> <span className="text-green">{userName}</span></>}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 sm:text-sm">Today's AI Intelligence Briefing</p>
        </div>
      </div>
    </header>
  );
}
