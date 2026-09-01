-- Shared rate-limit backing store for public edge functions (record-signal,
-- record-outcome, save-onboarding-profile, personalize). An in-memory Map
-- inside one Deno Deploy isolate can't limit traffic across the many
-- concurrent instances Supabase spins up under real load, so the counter
-- lives here instead: one atomic upsert per request, no read-then-write race.

create table if not exists public.rate_limits (
  bucket_key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null
);

comment on table public.rate_limits is
  'Sliding-window request counters for edge-function rate limiting. bucket_key is "<fn_name>:<ip>".';

-- Atomically increments the bucket (resetting it if the window has elapsed)
-- and reports whether the caller is still under p_limit. security definer so
-- edge functions can call it with the anon/service key without needing
-- direct table grants.
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into public.rate_limits (bucket_key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update
    set count = case when public.rate_limits.reset_at <= v_now then 1 else public.rate_limits.count + 1 end,
        reset_at = case when public.rate_limits.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds) else public.rate_limits.reset_at end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated, service_role;

-- Bucket count is small per window and self-heals (upsert overwrites stale
-- rows on next hit), but IPs that never return leave a row behind forever.
-- Sweep anything a day past its window so the table doesn't grow unbounded.
create or replace function public.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where reset_at < now() - interval '1 day';
$$;

grant execute on function public.cleanup_rate_limits() to service_role;

select cron.schedule('cleanup-rate-limits', '17 3 * * *', $c$ select public.cleanup_rate_limits() $c$);
