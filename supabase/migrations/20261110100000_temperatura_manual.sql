-- Temperatura do lead escolhida pela vendedora (quente/morno/frio). A escolha vale até ela devolver para a IA.

alter table leads add column temperatura_manual boolean not null default false;

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
      new.temperatura_manual := false;
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
    -- Temperatura: só definir_temperatura (via_funcao) muda a escolhida pela vendedora; a IA (sem auth.uid) não passa por cima dela.
    if not via_funcao() and (auth.uid() is not null or old.temperatura_manual) then
      new.temperatura := old.temperatura;
      new.temperatura_manual := old.temperatura_manual;
    end if;
    if auth.uid() is not null then
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

create function definir_temperatura(p_lead uuid, p_temperatura text) returns void
language plpgsql security definer set search_path = public as $$
declare l leads;
begin
  select * into l from leads where id = p_lead;
  if l.id is null or auth.uid() is null
     or not (ve_todos_leads(l.loja_id) or (l.vendedor_id = auth.uid() and meu_cargo(l.loja_id) = 'vendedor')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_temperatura is not null and p_temperatura not in ('quente', 'morno', 'frio') then raise exception 'temperatura_invalida'; end if;
  perform set_config('app.via_funcao', 'sim', true);
  update leads set temperatura = p_temperatura, temperatura_manual = p_temperatura is not null where id = l.id;
  perform set_config('app.via_funcao', '', true);
end $$;

revoke execute on function definir_temperatura(uuid, text) from public, anon, authenticated;
grant execute on function definir_temperatura(uuid, text) to authenticated;
