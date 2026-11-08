-- Correções da revisão de segurança do Plano 2.

-- C1: o Supabase concede EXECUTE em toda função nova a anon/authenticated (ACL padrão do papel postgres).
-- Daqui em diante função nova nasce fechada; cada uma recebe grant explícito.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Internas: ninguém de fora chama.
revoke execute on function avisar(uuid, uuid, text, text, text), via_funcao(),
  tarefas_antes_gravar(), tarefas_depois_gravar() from public, anon, authenticated;
-- Ações e auxiliares: só quem está logado.
revoke execute on function hoje_sp(), gere_loja(uuid), membro_da_loja(uuid, uuid),
  cobrar_tarefa(uuid, text), pedir_novo_prazo(uuid, date, text),
  decidir_novo_prazo(uuid, boolean), marcar_avisos_lidos() from public, anon;

-- I5: eventos e avisos só nascem por trigger/função.
revoke insert, update, delete on tarefa_eventos, notificacoes from authenticated, anon;

-- C2 + I2: sem login não passa (auth.uid() nulo); aviso vai para quem cobrou ou, sem isso, para toda a gerência.
create or replace function pedir_novo_prazo(p_tarefa uuid, p_prazo date, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tarefas;
  v_cobrador uuid;
  v_texto text;
  v_gestor uuid;
begin
  select * into t from tarefas where id = p_tarefa;
  if t.id is null or auth.uid() is null or t.responsavel_id is distinct from auth.uid() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if t.status = 'feito' then raise exception 'tarefa_concluida'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'motivo_obrigatorio'; end if;
  if p_prazo is null or p_prazo < hoje_sp() then raise exception 'prazo_no_passado'; end if;

  perform set_config('app.via_funcao', 'sim', true);
  update tarefas set prazo_pedido = p_prazo where id = t.id;
  perform set_config('app.via_funcao', '', true);

  insert into tarefa_eventos (tarefa_id, autor_id, tipo, texto, prazo) values (t.id, auth.uid(), 'prazo_pedido', trim(p_motivo), p_prazo);
  v_texto := t.titulo || ' · para ' || to_char(p_prazo, 'DD/MM') || ': ' || trim(p_motivo);
  select autor_id into v_cobrador from tarefa_eventos
    where tarefa_id = t.id and tipo = 'cobranca' order by criado_em desc limit 1;
  if v_cobrador is not null and v_cobrador <> auth.uid() then
    perform avisar(v_cobrador, t.loja_id, 'Pedido de novo prazo', v_texto, '/tarefas/' || t.id);
  else
    for v_gestor in select usuario_id from membros where loja_id = t.loja_id and cargo in ('dono', 'gerente') loop
      perform avisar(v_gestor, t.loja_id, 'Pedido de novo prazo', v_texto, '/tarefas/' || t.id);
    end loop;
  end if;
end $$;

-- I1: recorrente_de só é gravado pela própria recorrência (via_funcao), nunca pelo cliente.
create or replace function tarefas_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    new.prazo_alterado_vezes := 0;
    new.prazo_pedido := null;
    if not via_funcao() then new.recorrente_de := null; end if;
  else
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

create or replace function tarefas_depois_gravar() returns trigger
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

  if new.status = 'feito' and old.status <> 'feito' and new.recorrencia is not null then
    v_proximo := case new.recorrencia
      when 'diaria' then new.prazo + 1
      when 'semanal' then new.prazo + 7
      else (new.prazo + interval '1 month')::date
    end;
    perform set_config('app.via_funcao', 'sim', true);
    insert into tarefas (loja_id, titulo, descricao, responsavel_id, criado_por, prazo, recorrencia, recorrente_de)
      values (new.loja_id, new.titulo, new.descricao, new.responsavel_id, new.criado_por, v_proximo, new.recorrencia, new.id)
      on conflict (recorrente_de) do nothing;
    perform set_config('app.via_funcao', '', true);
  end if;
  return null;
end $$;
