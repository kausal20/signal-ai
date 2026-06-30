-- Signal — Phase 1 Foundation · 0007 ROW LEVEL SECURITY
ALTER TABLE public.clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_connectors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_health      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fetch_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_clusters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_locks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circuit_breakers   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_connectors' AND policyname='public read source connectors') THEN
    CREATE POLICY "public read source connectors" ON public.source_connectors FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='source_health' AND policyname='public read source health') THEN
    CREATE POLICY "public read source health" ON public.source_health FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='feed_items' AND policyname='public read feed items') THEN
    CREATE POLICY "public read feed items" ON public.feed_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_intelligence' AND policyname='public read story intelligence') THEN
    CREATE POLICY "public read story intelligence" ON public.story_intelligence FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='circuit_breakers' AND policyname='public read circuit breakers') THEN
    CREATE POLICY "public read circuit breakers" ON public.circuit_breakers FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND policyname='no public access clients') THEN
    CREATE POLICY "no public access clients" ON public.clients FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_profiles' AND policyname='no public access user profiles') THEN
    CREATE POLICY "no public access user profiles" ON public.user_profiles FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='raw_items' AND policyname='no public access raw items') THEN
    CREATE POLICY "no public access raw items" ON public.raw_items FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fetch_log' AND policyname='no public access fetch log') THEN
    CREATE POLICY "no public access fetch log" ON public.fetch_log FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_clusters' AND policyname='no public access story clusters') THEN
    CREATE POLICY "no public access story clusters" ON public.story_clusters FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pipeline_runs' AND policyname='no public access pipeline runs') THEN
    CREATE POLICY "no public access pipeline runs" ON public.pipeline_runs FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_log' AND policyname='no public access event log') THEN
    CREATE POLICY "no public access event log" ON public.event_log FOR SELECT USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_locks' AND policyname='no public access job locks') THEN
    CREATE POLICY "no public access job locks" ON public.job_locks FOR SELECT USING (false);
  END IF;
END $$;
