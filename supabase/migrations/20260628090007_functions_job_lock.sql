-- Signal — Phase 1 Foundation · 0007 SHARED FUNCTIONS (JOB LOCK)
-- Purpose: cron concurrency control functions. Depends on job_locks table (006).
--   * acquire_job_lock()/release_job_lock() → prevent overlapping scheduled executions.

CREATE OR REPLACE FUNCTION public.acquire_job_lock(p_job text, p_ttl_seconds int, p_holder text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  got boolean := false;
BEGIN
  INSERT INTO public.job_locks (job_name, locked_at, expires_at, holder)
  VALUES (p_job, now(), now() + make_interval(secs => p_ttl_seconds), p_holder)
  ON CONFLICT (job_name) DO UPDATE
    SET locked_at = now(),
        expires_at = now() + make_interval(secs => p_ttl_seconds),
        holder = p_holder
    WHERE public.job_locks.expires_at < now()
  RETURNING true INTO got;
  RETURN COALESCE(got, false);
END;
$$;
COMMENT ON FUNCTION public.acquire_job_lock(text, int, text) IS 'Atomic cron lock: true if acquired (or stolen when expired).';

CREATE OR REPLACE FUNCTION public.release_job_lock(p_job text)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.job_locks WHERE job_name = p_job;
$$;
COMMENT ON FUNCTION public.release_job_lock(text) IS 'Release a named job lock.';
