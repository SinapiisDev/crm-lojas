-- Lead que já nasce Vendido/Perdido (importação, cadastro direto) também ganha fechado_em,
-- senão some do painel.
create or replace function leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;
  new.ultimo_contato_em := least(new.ultimo_contato_em, now());
  if new.etapa <> 'vendido' then new.valor_vendido := null; end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;
  if tg_op = 'INSERT' then
    new.fechado_em := case when new.etapa in ('vendido', 'perdido') then least(coalesce(new.fechado_em, now()), now()) end;
  else
    new.atualizado_em := now();
    if new.etapa is distinct from old.etapa then
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    else
      new.fechado_em := old.fechado_em;
    end if;
  end if;
  return new;
end $$;
