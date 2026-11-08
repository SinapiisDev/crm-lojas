-- Tarefas por pessoa, cobrança, pedido de novo prazo e avisos dentro do app.
-- Avisos ficam em `notificacoes`; push/e-mail entram depois por cima desta tabela.

-- Funções novas não ficam executáveis por qualquer um; cada uma recebe grant explícito.
alter default privileges in schema public revoke execute on functions from public;

create type status_tarefa as enum ('a_fazer', 'fazendo', 'feito');
create type recorrencia_tarefa as enum ('diaria', 'semanal', 'mensal');
create type tipo_evento_tarefa as enum (
  'criada', 'status', 'cobranca', 'prazo_pedido', 'prazo_aprovado', 'prazo_recusado', 'prazo_alterado'
);

create table tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  loja_id uuid not null references lojas on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  responsavel_id uuid not null references perfis,
  criado_por uuid references perfis on delete set null,
  prazo date not null,
  status status_tarefa not null default 'a_fazer',
  recorrencia recorrencia_tarefa,
  recorrente_de uuid references tarefas on delete set null,
  concluida_em timestamptz,
  concluida_por uuid references perfis on delete set null,
  prazo_alterado_vezes int not null default 0,
  prazo_pedido date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index tarefas_loja_status on tarefas (loja_id, status);
create index tarefas_responsavel on tarefas (responsavel_id);
create unique index tarefas_uma_proxima on tarefas (recorrente_de);

create table tarefa_eventos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas on delete cascade,
  autor_id uuid references perfis on delete set null,
  tipo tipo_evento_tarefa not null,
  texto text,
  prazo date,
  criado_em timestamptz not null default now()
);
create index tarefa_eventos_tarefa on tarefa_eventos (tarefa_id, criado_em desc);

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfis on delete cascade,
  loja_id uuid references lojas on delete cascade,
  titulo text not null,
  texto text,
  link text,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index notificacoes_usuario on notificacoes (usuario_id, lida_em, criado_em desc);

-- ---------- Funções auxiliares ----------

create function hoje_sp() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function gere_loja(p_loja uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_cargo(p_loja) in ('dono', 'gerente'), false)
$$;

create function membro_da_loja(p_usuario uuid, p_loja uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where usuario_id = p_usuario and loja_id = p_loja)
$$;

-- Ninguém recebe aviso da própria ação.
create function avisar(p_usuario uuid, p_loja uuid, p_titulo text, p_texto text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null or p_usuario = auth.uid() then return; end if;
  insert into notificacoes (usuario_id, loja_id, titulo, texto, link) values (p_usuario, p_loja, p_titulo, p_texto, p_link);
end $$;

create function via_funcao() returns boolean language sql stable as $$
  select coalesce(current_setting('app.via_funcao', true), '') = 'sim'
$$;

-- ---------- Triggers ----------

create function tarefas_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.prazo_alterado_vezes := 0;
    new.prazo_pedido := null;
  else
    -- Quem não gere a loja só muda o status; prazo pedido só pela função.
    if auth.uid() is not null and not via_funcao() and not gere_loja(old.loja_id) and (
      new.titulo is distinct from old.titulo or new.descricao is distinct from old.descricao
      or new.responsavel_id is distinct from old.responsavel_id or new.prazo is distinct from old.prazo
      or new.recorrencia is distinct from old.recorrencia or new.loja_id is distinct from old.loja_id
    ) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if not via_funcao() then new.prazo_pedido := old.prazo_pedido; end if;
    new.criado_por := old.criado_por;
    new.recorrente_de := old.recorrente_de;
    new.prazo_alterado_vezes := old.prazo_alterado_vezes + (new.prazo is distinct from old.prazo)::int;
    new.atualizado_em := now();
  end if;

  if new.status = 'feito' and (tg_op = 'INSERT' or old.status <> 'feito') then
    new.concluida_em := now();
    new.concluida_por := coalesce(auth.uid(), new.responsavel_id);
  elsif new.status = 'feito' then
    new.concluida_em := old.concluida_em;
    new.concluida_por := old.concluida_por;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end $$;
create trigger tarefas_antes_gravar before insert or update on tarefas
  for each row execute function tarefas_antes_gravar();

create function tarefas_depois_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_link text := '/tarefas/' || new.id;
  v_proximo date;
begin
  if tg_op = 'INSERT' then
    insert into tarefa_eventos (tarefa_id, autor_id, tipo) values (new.id, new.criado_por, 'criada');
    perform avisar(new.responsavel_id, new.loja_id, 'Nova tarefa para você',
      new.titulo || ' · prazo ' || to_char(new.prazo, 'DD/MM'), v_link);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into tarefa_eventos (tarefa_id, autor_id, tipo, texto) values (new.id, auth.uid(), 'status',
      case new.status when 'a_fazer' then 'A fazer' when 'fazendo' then 'Fazendo' else 'Feito' end);
  end if;

  if new.prazo is distinct from old.prazo and not via_funcao() then
    insert into tarefa_eventos (tarefa_id, autor_id, tipo, prazo) values (new.id, auth.uid(), 'prazo_alterado', new.prazo);
    perform avisar(new.responsavel_id, new.loja_id, 'Prazo alterado',
      new.titulo || ' · novo prazo ' || to_char(new.prazo, 'DD/MM'), v_link);
  end if;

  -- Recorrente: ao concluir, nasce a próxima (uma só, garantida pelo índice único).
  if new.status = 'feito' and old.status <> 'feito' and new.recorrencia is not null then
    v_proximo := case new.recorrencia
      when 'diaria' then new.prazo + 1
      when 'semanal' then new.prazo + 7
      else (new.prazo + interval '1 month')::date
    end;
    insert into tarefas (loja_id, titulo, descricao, responsavel_id, criado_por, prazo, recorrencia, recorrente_de)
      values (new.loja_id, new.titulo, new.descricao, new.responsavel_id, new.criado_por, v_proximo, new.recorrencia, new.id)
      on conflict (recorrente_de) do nothing;
  end if;
  return null;
end $$;
create trigger tarefas_depois_gravar after insert or update on tarefas
  for each row execute function tarefas_depois_gravar();

-- ---------- Ações (RPC) ----------

create function cobrar_tarefa(p_tarefa uuid, p_mensagem text) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if t.id is null or not gere_loja(t.loja_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if t.status = 'feito' then raise exception 'tarefa_concluida'; end if;
  if length(trim(coalesce(p_mensagem, ''))) = 0 then raise exception 'mensagem_obrigatoria'; end if;
  insert into tarefa_eventos (tarefa_id, autor_id, tipo, texto) values (t.id, auth.uid(), 'cobranca', trim(p_mensagem));
  perform avisar(t.responsavel_id, t.loja_id, 'Cobrança: ' || t.titulo, trim(p_mensagem), '/tarefas/' || t.id);
end $$;

create function pedir_novo_prazo(p_tarefa uuid, p_prazo date, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tarefas;
  v_destino uuid;
begin
  select * into t from tarefas where id = p_tarefa;
  if t.id is null or t.responsavel_id <> auth.uid() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if t.status = 'feito' then raise exception 'tarefa_concluida'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'motivo_obrigatorio'; end if;
  if p_prazo is null or p_prazo < hoje_sp() then raise exception 'prazo_no_passado'; end if;

  perform set_config('app.via_funcao', 'sim', true);
  update tarefas set prazo_pedido = p_prazo where id = t.id;
  perform set_config('app.via_funcao', '', true);

  insert into tarefa_eventos (tarefa_id, autor_id, tipo, texto, prazo) values (t.id, auth.uid(), 'prazo_pedido', trim(p_motivo), p_prazo);
  select autor_id into v_destino from tarefa_eventos
    where tarefa_id = t.id and tipo = 'cobranca' order by criado_em desc limit 1;
  perform avisar(coalesce(v_destino, t.criado_por), t.loja_id, 'Pedido de novo prazo',
    t.titulo || ' · para ' || to_char(p_prazo, 'DD/MM') || ': ' || trim(p_motivo), '/tarefas/' || t.id);
end $$;

create function decidir_novo_prazo(p_tarefa uuid, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if t.id is null or not gere_loja(t.loja_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if t.prazo_pedido is null then raise exception 'sem_pedido'; end if;

  perform set_config('app.via_funcao', 'sim', true);
  if p_aprovar then
    update tarefas set prazo = prazo_pedido, prazo_pedido = null where id = t.id;
  else
    update tarefas set prazo_pedido = null where id = t.id;
  end if;
  perform set_config('app.via_funcao', '', true);

  insert into tarefa_eventos (tarefa_id, autor_id, tipo, prazo)
    values (t.id, auth.uid(), case when p_aprovar then 'prazo_aprovado' else 'prazo_recusado' end::tipo_evento_tarefa, t.prazo_pedido);
  perform avisar(t.responsavel_id, t.loja_id,
    case when p_aprovar then 'Novo prazo aprovado' else 'Novo prazo recusado' end,
    t.titulo || case when p_aprovar then ' · prazo ' || to_char(t.prazo_pedido, 'DD/MM') else '' end, '/tarefas/' || t.id);
end $$;

create function marcar_avisos_lidos() returns void
language sql security definer set search_path = public as $$
  update notificacoes set lida_em = now() where usuario_id = auth.uid() and lida_em is null
$$;

-- ---------- RLS ----------

alter table tarefas enable row level security;
alter table tarefa_eventos enable row level security;
alter table notificacoes enable row level security;

create policy tarefas_ver on tarefas for select to authenticated using (meu_cargo(loja_id) is not null);
create policy tarefas_criar on tarefas for insert to authenticated with check (
  membro_da_loja(responsavel_id, loja_id) and (gere_loja(loja_id) or (responsavel_id = auth.uid() and meu_cargo(loja_id) is not null))
);
create policy tarefas_editar on tarefas for update to authenticated
  using (gere_loja(loja_id) or responsavel_id = auth.uid())
  with check (membro_da_loja(responsavel_id, loja_id) and (gere_loja(loja_id) or responsavel_id = auth.uid()));
create policy tarefas_apagar on tarefas for delete to authenticated using (gere_loja(loja_id));

create policy tarefa_eventos_ver on tarefa_eventos for select to authenticated using (
  exists (select 1 from tarefas where tarefas.id = tarefa_eventos.tarefa_id)
);

create policy notificacoes_ver on notificacoes for select to authenticated using (usuario_id = auth.uid());

-- ---------- Permissões e realtime ----------

revoke all on tarefas, tarefa_eventos, notificacoes from anon;
grant select, insert, update, delete on tarefas to authenticated;
grant select on tarefa_eventos, notificacoes to authenticated;
grant execute on function hoje_sp(), gere_loja(uuid), membro_da_loja(uuid, uuid),
  cobrar_tarefa(uuid, text), pedir_novo_prazo(uuid, date, text), decidir_novo_prazo(uuid, boolean),
  marcar_avisos_lidos() to authenticated;

alter publication supabase_realtime add table tarefas, notificacoes;
