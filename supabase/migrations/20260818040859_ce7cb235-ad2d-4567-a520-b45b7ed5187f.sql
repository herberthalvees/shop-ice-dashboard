SELECT cron.schedule(
  'pos-venda-contatos',
  '20 6 * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/pos-venda?acao=contatos&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 180000)$$
);

SELECT cron.schedule(
  'pos-venda-fila',
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$select net.http_get(url := 'https://project--73ef96e5-75af-4341-beba-ebd8e4a66fc1.lovable.app/api/public/shopee/pos-venda?acao=fila&s=juvczosnr426ah73mdktpf951l8yewxg0biq', timeout_milliseconds := 180000)$$
);