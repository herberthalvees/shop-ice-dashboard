
CREATE TABLE public.resumo_cron_config (
  id smallint PRIMARY KEY DEFAULT 1,
  base_url text NOT NULL,
  cron_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resumo_cron_config_single CHECK (id = 1)
);
GRANT ALL ON public.resumo_cron_config TO service_role;
ALTER TABLE public.resumo_cron_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages resumo cron config" ON public.resumo_cron_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.resumo_cron_config (id, base_url, cron_secret)
VALUES (1, 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app', 'juvczosnr426ah73mdktpf951l8yewxg0biq');

CREATE TABLE public.resumo_horarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'parcial' CHECK (tipo IN ('parcial','fechamento')),
  hora smallint NOT NULL CHECK (hora BETWEEN 0 AND 23),
  minuto smallint NOT NULL DEFAULT 0 CHECK (minuto BETWEEN 0 AND 59),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, hora, minuto)
);
CREATE UNIQUE INDEX resumo_horarios_unico_fechamento ON public.resumo_horarios (tipo) WHERE tipo = 'fechamento';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumo_horarios TO authenticated;
GRANT ALL ON public.resumo_horarios TO service_role;
ALTER TABLE public.resumo_horarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conta autenticada gerencia horarios de resumo" ON public.resumo_horarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.resumo_horarios_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;
CREATE TRIGGER resumo_horarios_set_updated_at BEFORE UPDATE ON public.resumo_horarios
  FOR EACH ROW EXECUTE FUNCTION public.resumo_horarios_touch();

INSERT INTO public.resumo_horarios (tipo, hora, minuto) VALUES
  ('parcial', 9, 8),
  ('parcial', 14, 8),
  ('parcial', 19, 8),
  ('parcial', 23, 8),
  ('fechamento', 1, 0);

CREATE OR REPLACE FUNCTION public.resumo_horarios_aplicar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
DECLARE
  j record;
  r record;
  cfg record;
  n integer := 0;
  cmd text;
  sched text;
  utc_h integer;
BEGIN
  SELECT * INTO cfg FROM public.resumo_cron_config WHERE id = 1;
  IF cfg IS NULL THEN
    RAISE EXCEPTION 'configuracao de agendamento ausente';
  END IF;

  FOR j IN
    SELECT jobname FROM cron.job
    WHERE jobname = 'shopee-resumo-diario'
       OR jobname LIKE 'shopee-resumo-parcial-%'
       OR jobname LIKE 'shopee-resumo-fechamento%'
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;

  FOR r IN
    SELECT * FROM public.resumo_horarios WHERE ativo ORDER BY tipo, hora, minuto
  LOOP
    utc_h := (r.hora + 3) % 24;
    sched := r.minuto::text || ' ' || utc_h::text || ' * * *';

    IF r.tipo = 'parcial' THEN
      cmd := format(
        $q$select net.http_post(url := %L || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') || %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 60000)$q$,
        cfg.base_url || '/api/public/shopee/resumo-diario?parcial=1&data=',
        '&s=' || cfg.cron_secret
      );
      PERFORM cron.schedule(
        'shopee-resumo-parcial-' || lpad(r.hora::text, 2, '0') || lpad(r.minuto::text, 2, '0'),
        sched,
        cmd
      );
    ELSE
      cmd := format(
        $q$select net.http_post(url := %L, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 120000)$q$,
        cfg.base_url || '/api/public/shopee/resumo-diario?s=' || cfg.cron_secret
      );
      PERFORM cron.schedule('shopee-resumo-fechamento', sched, cmd);
    END IF;

    n := n + 1;
  END LOOP;

  RETURN n;
END $fn$;

REVOKE ALL ON FUNCTION public.resumo_horarios_aplicar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumo_horarios_aplicar() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resumo_horarios_sincronizar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.resumo_horarios_aplicar();
  RETURN NULL;
END $$;

CREATE TRIGGER resumo_horarios_aplicar_cron
AFTER INSERT OR UPDATE OR DELETE ON public.resumo_horarios
FOR EACH STATEMENT EXECUTE FUNCTION public.resumo_horarios_sincronizar();

SELECT public.resumo_horarios_aplicar();
