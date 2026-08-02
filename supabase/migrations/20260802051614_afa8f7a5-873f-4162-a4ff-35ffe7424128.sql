-- ============ TABELAS ============
CREATE TABLE public.ia_conversas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL DEFAULT 'Nova conversa',
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_conversas TO authenticated;
GRANT ALL ON public.ia_conversas TO service_role;
ALTER TABLE public.ia_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage ia_conversas" ON public.ia_conversas FOR ALL TO authenticated
  USING (public.eh_owner()) WITH CHECK (public.eh_owner());

CREATE TABLE public.ia_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES public.ia_conversas(id) ON DELETE CASCADE,
  msg_id text,
  role text NOT NULL,
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ia_mensagens_conversa_idx ON public.ia_mensagens (conversa_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_mensagens TO authenticated;
GRANT ALL ON public.ia_mensagens TO service_role;
ALTER TABLE public.ia_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage ia_mensagens" ON public.ia_mensagens FOR ALL TO authenticated
  USING (public.eh_owner()) WITH CHECK (public.eh_owner());

CREATE TABLE public.ia_memoria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'fato',
  chave text NOT NULL,
  conteudo text NOT NULL,
  peso smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_memoria TO authenticated;
GRANT ALL ON public.ia_memoria TO service_role;
ALTER TABLE public.ia_memoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manage ia_memoria" ON public.ia_memoria FOR ALL TO authenticated
  USING (public.eh_owner()) WITH CHECK (public.eh_owner());

CREATE TRIGGER ia_conversas_updated_at BEFORE UPDATE ON public.ia_conversas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ia_memoria_updated_at BEFORE UPDATE ON public.ia_memoria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ INTROSPECÇÃO DE SCHEMA ============
CREATE OR REPLACE FUNCTION public.ia_schema()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case when public.eh_owner() then coalesce(jsonb_agg(t order by t->>'tabela'), '[]'::jsonb) else '[]'::jsonb end
  from (
    select jsonb_build_object(
      'tabela', c.table_name,
      'colunas', (
        select jsonb_agg(jsonb_build_object('nome', k.column_name, 'tipo', k.data_type) order by k.ordinal_position)
        from information_schema.columns k
        where k.table_schema = 'public' and k.table_name = c.table_name
      )
    ) as t
    from information_schema.tables c
    where c.table_schema = 'public' and c.table_type = 'BASE TABLE'
  ) s;
$$;
REVOKE ALL ON FUNCTION public.ia_schema() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_schema() TO authenticated, service_role;

-- ============ EXECUÇÃO SOMENTE-LEITURA ============
CREATE OR REPLACE FUNCTION public.ia_sql(consulta text, limite integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q text;
  resultado jsonb;
BEGIN
  IF NOT public.eh_owner() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  q := btrim(consulta);
  q := regexp_replace(q, ';\s*$', '');

  IF q !~* '^(select|with)\s' THEN
    RAISE EXCEPTION 'apenas consultas SELECT/WITH sao permitidas';
  END IF;
  IF position(';' in q) > 0 THEN
    RAISE EXCEPTION 'apenas uma instrucao por consulta';
  END IF;
  IF q ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|reindex|comment|call|do|merge|listen|notify|set|reset|refresh|lock|prepare|execute|begin|commit|rollback|security|pg_read_file|pg_ls_dir|dblink|pg_sleep)\y' THEN
    RAISE EXCEPTION 'comando nao permitido na consulta';
  END IF;
  IF q ~* '\y(auth|vault|storage|supabase_functions|pg_catalog|information_schema)\.' THEN
    RAISE EXCEPTION 'schema nao permitido na consulta';
  END IF;

  SET LOCAL statement_timeout = '15s';
  SET LOCAL transaction_read_only = on;

  EXECUTE format(
    'select coalesce(jsonb_agg(x), ''[]''::jsonb) from (select * from (%s) sub limit %s) x',
    q, greatest(1, least(coalesce(limite, 200), 1000))
  ) INTO resultado;

  RETURN resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.ia_sql(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_sql(text, integer) TO authenticated, service_role;