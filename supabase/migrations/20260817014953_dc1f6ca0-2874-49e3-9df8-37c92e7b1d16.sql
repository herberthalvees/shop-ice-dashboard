DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_envios' AND policyname='chat_envios sem insert do cliente') THEN
    CREATE POLICY "chat_envios sem insert do cliente" ON public.chat_envios FOR INSERT TO authenticated, anon WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_envios' AND policyname='chat_envios sem update do cliente') THEN
    CREATE POLICY "chat_envios sem update do cliente" ON public.chat_envios FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_envios' AND policyname='chat_envios sem delete do cliente') THEN
    CREATE POLICY "chat_envios sem delete do cliente" ON public.chat_envios FOR DELETE TO authenticated, anon USING (false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ads_campanhas' AND policyname='ads_campanhas sem insert do cliente') THEN
    CREATE POLICY "ads_campanhas sem insert do cliente" ON public.ads_campanhas FOR INSERT TO authenticated, anon WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ads_campanhas' AND policyname='ads_campanhas sem update do cliente') THEN
    CREATE POLICY "ads_campanhas sem update do cliente" ON public.ads_campanhas FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ads_campanhas' AND policyname='ads_campanhas sem delete do cliente') THEN
    CREATE POLICY "ads_campanhas sem delete do cliente" ON public.ads_campanhas FOR DELETE TO authenticated, anon USING (false);
  END IF;
END $$;