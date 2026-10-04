import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorialTheme } from "@/ui-editorial/theme";
import "@/ui-editorial/tokens.css";

interface Props {
  step: number;
  total?: number;
  showBack?: boolean;
  hideDots?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function OnboardingShell({ step, showBack = true, hideDots = false, onBack, children, className }: Props) {
  const theme = useEditorialTheme();
  const activeDotIndex = step - 2;

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ed-onboarding");
    if (!root) return;
    const ground = getComputedStyle(root).backgroundColor;
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = { html: html.style.backgroundColor, body: body.style.backgroundColor, scheme: html.style.colorScheme, meta: meta?.content };
    html.style.backgroundColor = ground;
    body.style.backgroundColor = ground;
    html.style.colorScheme = theme.resolved;
    if (meta) meta.content = ground;
    return () => {
      html.style.backgroundColor = previous.html;
      body.style.backgroundColor = previous.body;
      html.style.colorScheme = previous.scheme;
      if (meta && previous.meta) meta.content = previous.meta;
    };
  }, [theme.resolved]);

  return (
    <div className="ed-stage">
      <main
        data-ed-theme={theme.resolved}
        className={cn("ed-root ed-onboarding relative flex h-[100dvh] min-h-[640px] w-full flex-col overflow-hidden bg-ed-bg text-ed-text", className)}
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] z-50">
          {!hideDots && (
            <div role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={7} aria-valuenow={Math.max(1, Math.min(7, activeDotIndex + 1))} className="flex h-20 items-center justify-center gap-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <span key={index} className={cn("h-1.5 rounded-full transition-all duration-200", index === activeDotIndex ? "w-6 bg-ed-accent" : index < activeDotIndex ? "w-1.5 bg-ed-accent" : "w-1.5 bg-ed-border-strong")} />
              ))}
            </div>
          )}
          {showBack && (
            <button type="button" onClick={onBack} aria-label="Go back" className="absolute left-5 top-[18px] flex h-11 w-11 items-center justify-center rounded-lg border border-ed-border bg-ed-surface text-ed-text transition-colors hover:bg-ed-sunken active:scale-[0.98]">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
