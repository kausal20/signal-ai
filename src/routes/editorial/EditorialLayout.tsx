import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FeedProvider } from "@/app/FeedProvider";
import { ChatProvider } from "@/app/ChatProvider";
import { useOnboarding } from "@/hooks/useOnboarding";
import { initSignals } from "@/lib/signals";
import { AppShell } from "@/ui-editorial/layout/AppShell";
import { navKeyForPath } from "@/ui-editorial/components/nav";
import { SkeletonList } from "@/ui-editorial/components/Skeletons";
import { firstName } from "./shared";

/** Frame for the five destinations: onboarding gate, behavioural-signal session,
 *  shared feed + chat state, and the editorial shell. Replaces the old Index /
 *  PhoneFrame chrome for these routes only. */
export default function EditorialLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isComplete, loading } = useOnboarding();

  useEffect(() => initSignals(), []);

  useEffect(() => {
    if (!loading && !isComplete) navigate("/onboarding", { replace: true });
  }, [loading, isComplete, navigate]);

  if (loading || !isComplete) return null;

  const active = navKeyForPath(pathname);
  return (
    <FeedProvider>
      <ChatProvider>
        <AppShell
          active={active}
          surface="paper"
          name={firstName()}
          showHeaderOnMobile={active === "home"}
        >
          <Suspense fallback={<div className="pt-8"><SkeletonList count={4} /></div>}>
            <Outlet />
          </Suspense>
        </AppShell>
      </ChatProvider>
    </FeedProvider>
  );
}
