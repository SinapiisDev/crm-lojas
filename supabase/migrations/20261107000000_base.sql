-- Base do CRM: empresas, lojas, pessoas/cargos, convites e leads.
-- Toda regra de acesso mora aqui (RLS); a interface só reflete.

create type cargo as enum ('dono', 'gerente', 'vendedor', 'conferente');
create type etapa_lead as enum ('novo', 'em_contato', 'orcamento_enviado', 'negociacao', 'vendido', 'perdido');
create type origem_lead as enum ('instagram', 'loja_fisica', 'prospeccao', 'indicacao', 'outro');
create type tipo_evento_lead as enum ('criado', 'contato', 'whatsapp', 'etapa');

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table lojas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nome text not null,
  whatsapp text,
  dias_lead_parado int not null default 2 check (dias_lead_parado between 1 and 60),
  criado_em timestamptz not null default now()
);

create table perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  email text not null unique
);

create table membros (
  usuario_id uuid not null references perfis on delete cascade,
  loja_id uuid not null references lojas on delete cascade,
  cargo cargo not null,
  primary key (usuario_id, loja_id)
);

create table convites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  loja_id uuid not null references lojas on delete cascade,
  cargo cargo not null,
  criado_por uuid references perfis on delete set null default auth.uid(),
  aceito_em timestamptz,
  criado_em timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  loja_id uuid not null references lojas on delete cascade,
  vendedor_id uuid not null references perfis,
  nome text not null check (length(trim(nome)) > 0),
  telefone text not null default '',
  origem origem_lead not null default 'outro',
  etapa etapa_lead not null default 'novo',
  valor_estimado numeric(12, 2) check (valor_estimado >= 0),
  valor_vendido numeric(12, 2),
  motivo_perda text,
  ultimo_contato_em timestamptz not null default now(),
  temperatura text check (temperatura in ('quente', 'morno', 'frio')),
  fechado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint vendido_exige_valor check (etapa <> 'vendido' or coalesce(valor_vendido, 0) > 0),
  constraint perdido_exige_motivo check (etapa <> 'perdido' or length(trim(coalesce(motivo_perda, ''))) > 0)
);
create index leads_loja_etapa on leads (loja_id, etapa);
create index leads_vendedor on leads (vendedor_id);

create table lead_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads on delete cascade,
  autor_id uuid references perfis on delete set null default auth.uid(),
  tipo tipo_evento_lead not null,
  texto text,
  criado_em timestamptz not null default now()
);
create index lead_eventos_lead on lead_eventos (lead_id, criado_em desc);

-- ---------- Funções de acesso (security definer evita recursão de RLS) ----------

create function meu_cargo(p_loja uuid) returns cargo
language sql stable security definer set search_path = public as $$
  select cargo from membros where usuario_id = auth.uid() and loja_id = p_loja
$$;

create function ve_todos_leads(p_loja uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_cargo(p_loja) in ('dono', 'gerente'), false)
$$;

create function atende_leads(p_usuario uuid, p_loja uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros
    where usuario_id = p_usuario and loja_id = p_loja and cargo <> 'conferente'
  )
$$;

-- ---------- Triggers ----------

create function convites_normaliza() returns trigger language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
create trigger convites_normaliza before insert or update on convites
  for each row execute function convites_normaliza();

-- Pessoa que já tem conta e recebe convite para outra loja entra direto.
create function convites_vincula_existente() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_usuario uuid;
begin
  select id into v_usuario from perfis where email = new.email;
  if v_usuario is not null then
    insert into membros (usuario_id, loja_id, cargo) values (v_usuario, new.loja_id, new.cargo)
      on conflict (usuario_id, loja_id) do update set cargo = excluded.cargo;
    update convites set aceito_em = now() where id = new.id;
  end if;
  return null;
end $$;
create trigger convites_vincula_existente after insert on convites
  for each row execute function convites_vincula_existente();

-- Sem convite pendente, ninguém cria conta (vale para e-mail e Google).
create function ao_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(new.email);
begin
  if not exists (select 1 from convites where email = v_email and aceito_em is null) then
    raise exception 'convite_obrigatorio';
  end if;
  insert into perfis (id, nome, email) values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(v_email, '@', 1)
    ),
    v_email
  );
  insert into membros (usuario_id, loja_id, cargo)
    select distinct on (loja_id) new.id, loja_id, cargo
    from convites where email = v_email and aceito_em is null
    order by loja_id, criado_em desc;
  update convites set aceito_em = now() where email = v_email and aceito_em is null;
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function ao_criar_usuario();

create function leads_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select empresa_id into new.empresa_id from lojas where id = new.loja_id;
  else
    new.atualizado_em := now();
    if new.etapa is distinct from old.etapa then
      new.fechado_em := case when new.etapa in ('vendido', 'perdido') then now() end;
    end if;
  end if;
  return new;
end $$;
create trigger leads_antes_gravar before insert or update on leads
  for each row execute function leads_antes_gravar();

-- ---------- RLS ----------

alter table empresas enable row level security;
alter table lojas enable row level security;
alter table perfis enable row level security;
alter table membros enable row level security;
alter table convites enable row level security;
alter table leads enable row level security;
alter table lead_eventos enable row level security;

create policy empresas_ver on empresas for select to authenticated using (
  exists (select 1 from lojas where lojas.empresa_id = empresas.id)
);

create policy lojas_ver on lojas for select to authenticated using (meu_cargo(id) is not null);
create policy lojas_editar on lojas for update to authenticated
  using (meu_cargo(id) = 'dono') with check (meu_cargo(id) = 'dono');

create policy perfis_ver on perfis for select to authenticated using (
  id = auth.uid() or exists (select 1 from membros where membros.usuario_id = perfis.id)
);
create policy perfis_editar on perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy membros_ver on membros for select to authenticated using (meu_cargo(loja_id) is not null);

create policy convites_ver on convites for select to authenticated using (ve_todos_leads(loja_id));
create policy convites_criar on convites for insert to authenticated with check (
  meu_cargo(loja_id) = 'dono' or (meu_cargo(loja_id) = 'gerente' and cargo <> 'dono')
);
create policy convites_cancelar on convites for delete to authenticated
  using (ve_todos_leads(loja_id) and aceito_em is null);

create policy leads_ver on leads for select to authenticated using (
  ve_todos_leads(loja_id) or (vendedor_id = auth.uid() and meu_cargo(loja_id) = 'vendedor')
);
create policy leads_criar on leads for insert to authenticated with check (
  (ve_todos_leads(loja_id) or (vendedor_id = auth.uid() and meu_cargo(loja_id) = 'vendedor'))
  and atende_leads(vendedor_id, loja_id)
);
create policy leads_editar on leads for update to authenticated
  using (ve_todos_leads(loja_id) or (vendedor_id = auth.uid() and meu_cargo(loja_id) = 'vendedor'))
  with check (
    (ve_todos_leads(loja_id) or (vendedor_id = auth.uid() and meu_cargo(loja_id) = 'vendedor'))
    and atende_leads(vendedor_id, loja_id)
  );
create policy leads_apagar on leads for delete to authenticated using (meu_cargo(loja_id) = 'dono');

create policy lead_eventos_ver on lead_eventos for select to authenticated using (
  exists (select 1 from leads where leads.id = lead_eventos.lead_id)
);
create policy lead_eventos_criar on lead_eventos for insert to authenticated with check (
  autor_id = auth.uid() and exists (select 1 from leads where leads.id = lead_eventos.lead_id)
);

-- ---------- Permissões e realtime ----------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on all functions in schema public from anon, public;
grant execute on function meu_cargo(uuid), ve_todos_leads(uuid), atende_leads(uuid, uuid) to authenticated;

alter publication supabase_realtime add table leads;
