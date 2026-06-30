
SELECT cron.schedule(
  'refresh-ai-feed',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/fetch-feed',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
