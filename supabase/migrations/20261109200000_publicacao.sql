-- Rotina da IA em pedaços: a cada 5 min das 07:00 às 07:55 de São Paulo (cada chamada faz o que cabe no prazo).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'ia-diaria'),
  schedule := '*/5 10 * * *'
);

-- Despacho: espera até 30 s pela resposta (o padrão do pg_net, 5 s, abortava chamadas no meio do prazo)
-- e só roda com URL e segredo presentes.
select cron.schedule('despachar-avisos', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'avisos_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'avisos_segredo')
    and exists (select 1 from public.notificacoes where enviado_em is null and criado_em > now() - interval '1 day')
$job$);
