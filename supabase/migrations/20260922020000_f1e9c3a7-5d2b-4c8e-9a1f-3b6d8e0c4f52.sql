-- ============================================================
-- Registra no controle de versão os pg_cron jobs de sync que já
-- rodavam em produção fora do histórico rastreado (criados direto
-- no SQL Editor). cron.schedule() com um jobname já existente
-- atualiza o job em vez de duplicar, então é seguro reaplicar.
-- Valores (URL/params/secret) copiados 1:1 da consulta a cron.job
-- feita em produção em 2026-09-22.
-- ============================================================

select cron.schedule(
  'shopee-sync-10min',
  '*/10 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync?dias=0.05&campo=update_time&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-produtos',
  '0 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-produtos?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-ads',
  '0 */3 * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-ads?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-carteira',
  '*/30 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-carteira?horas=3&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-escrow',
  '*/15 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-escrow?limite=300&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 120000)$$
);

select cron.schedule(
  'shopee-sync-chat',
  '*/5 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-chat?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 60000)$$
);
