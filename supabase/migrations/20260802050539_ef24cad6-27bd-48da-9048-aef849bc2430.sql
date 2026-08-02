DO $$
DECLARE
  refresh_command text;
BEGIN
  SELECT command INTO refresh_command FROM cron.job WHERE jobname = 'shopee-refresh-token' LIMIT 1;
  IF refresh_command IS NULL THEN
    RAISE EXCEPTION 'Agendamento de renovacao nao encontrado';
  END IF;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'shopee-refresh-token';
  PERFORM cron.schedule(
    'shopee-refresh-token',
    '55 */2 * * *',
    replace(refresh_command, 'refresh-token?', 'refresh-token?forcar=1&')
  );
END $$;

DO $$
DECLARE
  sync_command text;
  secret_query text;
BEGIN
  SELECT command INTO sync_command FROM cron.job WHERE jobname = 'shopee-sync-10min' LIMIT 1;
  secret_query := substring(sync_command from 's=([^'']+)');
  IF secret_query IS NULL OR secret_query = '' THEN
    RAISE EXCEPTION 'Nao foi possivel preservar a autenticacao do cron';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'shopee-watchdog';
  PERFORM cron.schedule(
    'shopee-watchdog',
    '*/5 * * * *',
    format(
      'select net.http_get(url := %L, timeout_milliseconds := 120000)',
      'https://shop-ice-dashboard.lovable.app/api/public/shopee/watchdog?s=' || secret_query
    )
  );
END $$;