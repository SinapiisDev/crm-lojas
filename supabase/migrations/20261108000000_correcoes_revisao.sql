-- Correções da revisão de segurança do Plano 1.

-- C2: convite para quem já é da loja não muda o cargo (impede gerente rebaixar a dona).
-- Mudar cargo é outra operação, que não passa pelo convite.
create or replace function convites_vincula_existente() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_usuario uuid;
begin
  select id into v_usuario from perfis where email = new.email;
  if v_usuario is not null then
    insert into membros (usuario_id, loja_id, cargo) values (v_usuario, new.loja_id, new.cargo)
      on conflict (usuario_id, loja_id) do nothing;
    update convites set aceito_em = now() where id = new.id;
  end if;
  return null;
end $$;

-- C3: o e-mail do perfil é a chave dos convites; a pessoa só edita o próprio nome.
revoke update on perfis from authenticated;
grant update (nome) on perfis to authenticated;

-- I1 e I2: empresa sempre vem da loja; contato nunca no futuro;
-- valor vendido e motivo da perda só existem nas etapas deles.
create or replace function leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select empresa_id into new.empresa_id from lojas where id = new.loja_id;
  new.ultimo_contato_em := least(new.ultimo_contato_em, now());
  if new.etapa <> 'vendido' then new.valor_vendido := null; end if;
  if new.etapa <> 'perdido' then new.motivo_perda := null; end if;
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    if new.etapa is distinct from old.etapa then
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    end if;
  end if;
  return new;
end $$;
