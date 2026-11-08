-- IA: colunas no lead (só o servidor grava), resumos semanais por loja, aviso de lead parado com contexto e agendamento.

alter table leads
  add column resumo_ia text,
  add column sugestao_ia text,
  add column ia_em timestamptz;

-- Mesma regra de datas do Plano 3 + colunas de IA protegidas: cliente logado não grava; servidor (sem auth.uid) grava.
create or replace function leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;
  new.ultimo_contato_em := least(new.ultimo_contato_em, now());
  if new.etapa <> 'vendido' then new.valor_vendido := null; end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.temperatura := null;
      new.resumo_ia := null;
      new.sugestao_ia := null;
      new.ia_em := null;
    end if;
    if auth.uid() is not null and not gere_loja(new.loja_id) then
      new.criado_em := now();
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    else
      new.criado_em := least(coalesce(new.criado_em, now()), now());
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then least(coalesce(new.fechado_em, now()), now()) end;
    end if;
  else
    if auth.uid() is not null then
      new.temperatura := old.temperatura;
      new.resumo_ia := old.resumo_ia;
      new.sugestao_ia := old.sugestao_ia;
      new.ia_em := old.ia_em;
    end if;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
    if new.etapa is distinct from old.etapa then
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    else
      new.fechado_em := old.fechado_em;
    end if;
  end if;
  return new;
end $$;

create table resumos_semanais (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  semana_inicio date not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  unique (loja_id, semana_inicio)
);
alter table resumos_semanais enable row level security;
create policy resumos_semanais_ver on resumos_semanais for select to authenticated using (gere_loja(loja_id));
revoke all on resumos_semanais from anon, authenticated;
grant select on resumos_semanais to authenticated;

-- Aviso de lead parado: dias sem contato + o resumo da IA (quando houver).
create or replace function rotina_diaria() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := hoje_sp();
  r record;
  v_pessoa uuid;
  v_dias int;
begin
  for r in
    select l.id, l.nome, l.vendedor_id, l.loja_id, l.ultimo_contato_em, l.resumo_ia
    from leads l join lojas j on j.id = l.loja_id
    where l.etapa in ('orcamento_enviado', 'negociacao')
      and l.ultimo_contato_em <= now() - make_interval(days => j.dias_lead_parado)
  loop
    v_dias := floor(extract(epoch from now() - r.ultimo_contato_em) / 86400)::int;
    perform avisar_uma_vez(r.vendedor_id, r.loja_id, 'Lead parado: ' || r.nome,
      'Sem contato há ' || v_dias || ' dias. ' || coalesce(nullif(trim(r.resumo_ia), ''), 'Entre em contato de novo.'),
      '/leads/' || r.id, 'parado:' || r.id || ':' || v_hoje);
  end loop;

  for r in select id, titulo, responsavel_id, loja_id, prazo from tarefas where status <> 'feito' and prazo = v_hoje + 1 loop
    perform avisar_uma_vez(r.responsavel_id, r.loja_id, 'Tarefa vence amanhã', r.titulo,
      '/tarefas/' || r.id, 'vespera:' || r.id || ':' || r.prazo);
  end loop;

  for r in select id, titulo, responsavel_id, loja_id, prazo from tarefas where status <> 'feito' and prazo < v_hoje loop
    for v_pessoa in
      select r.responsavel_id
      union
      select usuario_id from membros where loja_id = r.loja_id and cargo in ('dono', 'gerente')
    loop
      perform avisar_uma_vez(v_pessoa, r.loja_id, 'Tarefa atrasada',
        r.titulo || ' · venceu ' || to_char(r.prazo, 'DD/MM'),
        '/tarefas/' || r.id, 'atraso:' || r.id || ':' || r.prazo || ':' || v_pessoa);
    end loop;
  end loop;
end $$;

-- Rotina da IA às 07:45 de São Paulo, antes dos avisos das 08:00. Mesma URL base e segredo do despacho.
select cron.schedule('ia-diaria', '45 10 * * *', $job$
  select net.http_post(
    url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'avisos_url'), '/api/avisos/despachar', '/api/ia/diaria'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'avisos_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'avisos_segredo')
$job$);
