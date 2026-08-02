DO $$
DECLARE
  watchdog_id bigint;
  cron_secret text;
BEGIN
  SELECT jobid INTO watchdog_id FROM cron.job WHERE jobname = 'shopee-watchdog' LIMIT 1;
  SELECT substring(command from '[?&]s=([^&'']+)') INTO cron_secret
  FROM cron.job WHERE jobname = 'shopee-sync-10min' LIMIT 1;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE EXCEPTION 'Nao foi possivel preservar a autenticacao do cron';
  END IF;
  IF watchdog_id IS NOT NULL THEN
    PERFORM cron.unschedule(watchdog_id);
  END IF;

  PERFORM cron.schedule(
    'shopee-watchdog',
    '*/5 * * * *',
    format(
      'select net.http_get(url := %L, timeout_milliseconds := 120000)',
      'https://shop-ice-dashboard.lovable.app/api/public/shopee/watchdog?s=' || cron_secret
    )
  );
END $$;