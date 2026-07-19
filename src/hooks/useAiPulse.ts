// useAiPulse — fetches AI Pulse intelligence from the `ai-pulse` edge function.
//
// While MESH_API_KEY / the function aren't set up yet, the hook falls back
// to the bundled SAMPLE_PULSE and flags `preview: true`, so the flagship page
// always renders premium content (behind a subtle "Preview" banner) instead of
// a dead error screen. Additive — no existing data flow touched.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SAMPLE_PULSE, type PulseData } from "@/data/aiPulse";

type Status = "loading" | "ready" | "error";

export function useAiPulse() {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PulseData | null>(null);
  const [preview, setPreview] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { data: res, error } = await supabase.functions.invoke("ai-pulse", { method: "GET" });
      if (error || !res?.ok || !res?.pulse) {
        // Graceful: show the sample behind a Preview banner rather than fail hard.
        setData(SAMPLE_PULSE);
        setPreview(true);
        setGeneratedAt(null);
        setStatus("ready");
        return;
      }
      setData(res.pulse as PulseData);
      setPreview(false);
      setGeneratedAt(res.generated_at ?? null);
      setStatus("ready");
    } catch {
      setData(SAMPLE_PULSE);
      setPreview(true);
      setStatus("ready");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { status, data, preview, generatedAt, reload: load };
}
