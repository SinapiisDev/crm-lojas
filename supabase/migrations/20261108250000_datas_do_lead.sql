-- O painel mede a vendedora pelas datas do lead; ela não pode escolhê-las.
-- Dona/gerente (e o sistema) podem informar datas no cadastro, para importação; nunca no futuro.
create or replace function leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;
  new.ultimo_contato_em := least(new.ultimo_contato_em, now());
  if new.etapa <> 'vendido' then new.valor_vendido := null; end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not gere_loja(new.loja_id) then
      new.criado_em := now();
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    else
      new.criado_em := least(coalesce(new.criado_em, now()), now());
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then least(coalesce(new.fechado_em, now()), now()) end;
    end if;
  else
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
