-- Avisos fora do app: inscrições de push, caixa de saída, rotina diária e agendamento.
-- Envio de fato (push/e-mail) roda no Next em /api/avisos/despachar; o banco só agenda e reserva.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- Inscrições de push (um aparelho = um endpoint) ----------

create table push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references perfis on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
create index push_inscricoes_usuario on push_inscricoes (usuario_id);

alter table push_inscricoes enable row level security;
create policy push_ver on push_inscricoes for select to authenticated using (usuario_id = auth.uid());
create policy push_apagar on push_inscricoes for delete to authenticated using (usuario_id = auth.uid());
revoke all on push_inscricoes from anon;
-- Gravar só pela ação do servidor, que valida o endpoint (só serviços de push conhecidos; evita SSRF).
revoke insert, update on push_inscricoes from authenticated;
grant select, delete on push_inscricoes to authenticated;

-- ---------- Caixa de saída ----------

alter table notificacoes
  add column enviado_em timestamptz,
  add column chave text unique;
create index notificacoes_pendentes on notificacoes (criado_em) where enviado_em is null;

-- Aviso com chave: repetir a mesma chave não cria outro (rotina pode rodar de novo no mesmo dia).
create function avisar_uma_vez(p_usuario uuid, p_loja uuid, p_titulo text, p_texto text, p_link text, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null then return; end if;
  insert into notificacoes (usuario_id, loja_id, titulo, texto, link, chave)
    values (p_usuario, p_loja, p_titulo, p_texto, p_link, p_chave)
    on conflict (chave) do nothing;
end $$;

-- Marca um lote como enviado e devolve; `skip locked` impede que dois despachos peguem o mesmo aviso.
-- Só as últimas 24 h: backlog antigo não vira enxurrada de push.
create function reservar_avisos(p_limite int) returns setof notificacoes
language sql security definer set search_path = public as $$
  update notificacoes n set enviado_em = now()
  where n.id in (
    select id from notificacoes
    where enviado_em is null and criado_em > now() - interval '1 day'
    order by criado_em
    limit p_limite
    for update skip locked
  )
  returning n.*
$$;

-- ---------- Rotina diária (08:00 de São Paulo) ----------

create function rotina_diaria() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := hoje_sp();
  r record;
  v_pessoa uuid;
  v_dias int;
begin
  -- Lead parado: vendedora, uma vez por lead por dia.
  for r in
    select l.id, l.nome, l.vendedor_id, l.loja_id, l.ultimo_contato_em
    from leads l join lojas j on j.id = l.loja_id
    where l.etapa in ('orcamento_enviado', 'negociacao')
      and l.ultimo_contato_em <= now() - make_interval(days => j.dias_lead_parado)
  loop
    v_dias := floor(extract(epoch from now() - r.ultimo_contato_em) / 86400)::int;
    perform avisar_uma_vez(r.vendedor_id, r.loja_id, 'Lead parado: ' || r.nome,
      'Sem contato há ' || v_dias || ' dias. Entre em contato de novo.',
      '/leads/' || r.id, 'parado:' || r.id || ':' || v_hoje);
  end loop;

  -- Véspera do prazo: responsável.
  for r in select id, titulo, responsavel_id, loja_id, prazo from tarefas where status <> 'feito' and prazo = v_hoje + 1 loop
    perform avisar_uma_vez(r.responsavel_id, r.loja_id, 'Tarefa vence amanhã', r.titulo,
      '/tarefas/' || r.id, 'vespera:' || r.id || ':' || r.prazo);
  end loop;

  -- Atraso: responsável e gerência, uma vez por prazo.
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

revoke execute on function avisar_uma_vez(uuid, uuid, text, text, text, text), reservar_avisos(int), rotina_diaria()
  from public, anon, authenticated;
grant execute on function reservar_avisos(int), rotina_diaria() to service_role;

-- ---------- Agendamento ----------
-- URL e segredo do despacho ficam no Vault (seed local; produção: configurar à mão, ver README).

select cron.schedule('rotina-diaria', '0 11 * * *', 'select public.rotina_diaria()');

select cron.schedule('despachar-avisos', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'avisos_url')
    and exists (select 1 from public.notificacoes where enviado_em is null and criado_em > now() - interval '1 day')
$job$);
