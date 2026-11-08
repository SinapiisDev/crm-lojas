-- Rotina da IA em pedaços: a cada 5 min das 07:00 às 07:55 de São Paulo (funções grátis cortam em ~10 s).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'ia-diaria'),
  schedule := '*/5 10 * * *'
);
