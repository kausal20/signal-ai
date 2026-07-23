-- Schedule cluster-users (collaborative filtering / cluster_profiles). This cron
-- was never created, so cluster_profiles stayed empty and personalize's
-- collaborative-relevance signal was always 0. Runs daily at 03:35 UTC (after the
-- nightly data settles). Reuses the Vault-authed trigger_edge wrapper.
do $$ begin perform cron.unschedule('cluster-users'); exception when others then null; end $$;
select cron.schedule('cluster-users', '35 3 * * *', $c$ select public.trigger_edge('cluster-users', '{}'::jsonb) $c$);
