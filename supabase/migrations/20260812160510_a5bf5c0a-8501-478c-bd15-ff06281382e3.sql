select cron.schedule(
  'shopee-sync-avaliacoes',
  '20 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/sync-avaliacoes?s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 180000)$$
);