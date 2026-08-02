DO $$
DECLARE
  refresh_url text;
BEGIN
  SELECT substring(command from 'url := ''([^'']+)''')
  INTO refresh_url
  FROM cron.job
  WHERE jobname = 'shopee-refresh-token'
  LIMIT 1;

  IF refresh_url IS NULL THEN
    RAISE EXCEPTION 'Agendamento de renovacao nao encontrado';
  END IF;

  PERFORM net.http_get(url := refresh_url, timeout_milliseconds := 120000);
END $$;