-- Reuniões com participantes, ata e lembrete. Toda escrita passa pelas funções abaixo (sem INSERT/UPDATE do cliente).
-- Funções novas já nascem sem EXECUTE para anon/authenticated (default privileges do Plano 2); grants explícitos no fim.

create table reunioes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  loja_id uuid not null references lojas on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 200),
  pauta text check (length(pauta) <= 5000),
  inicio timestamptz not null,
  duracao_min int not null default 60 check (duracao_min between 15 and 600),
  local text check (length(local) <= 300),
  criado_por uuid references perfis on delete set null,
  sequencia int not null default 0,
  cancelada boolean not null default false,
  aconteceu boolean,
  ata text check (length(ata) <= 20000),
  registrada_por uuid references perfis on delete set null,
  registrada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index reunioes_loja_inicio on reunioes (loja_id, inicio);

create table reuniao_participantes (
  reuniao_id uuid not null references reunioes on delete cascade,
  usuario_id uuid not null references perfis on delete cascade,
  primary key (reuniao_id, usuario_id)
);
create index reuniao_participantes_usuario on reuniao_participantes (usuario_id);

-- Token secreto do feed .ics de cada pessoa (tabela própria: colegas leem perfis, não podem ler o token).
create table agenda_tokens (
  usuario_id uuid primary key references perfis on delete cascade,
  token uuid not null unique default gen_random_uuid()
);

alter table reunioes enable row level security;
alter table reuniao_participantes enable row level security;
alter table agenda_tokens enable row level security;

create policy reunioes_ver on reunioes for select to authenticated using (meu_cargo(loja_id) is not null);
create policy reuniao_participantes_ver on reuniao_participantes for select to authenticated using (
  exists (select 1 from reunioes r where r.id = reuniao_id and meu_cargo(r.loja_id) is not null)
);
create policy agenda_tokens_ver on agenda_tokens for select to authenticated using (usuario_id = auth.uid());

revoke all on reunioes, reuniao_participantes, agenda_tokens from anon, authenticated;
grant select on reunioes, reuniao_participantes, agenda_tokens to authenticated;

-- ---------- Funções ----------

create function eh_participante(p_reuniao uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reuniao_participantes where reuniao_id = p_reuniao and usuario_id = p_usuario)
$$;

create function quando_sp(p_inicio timestamptz) returns text language sql immutable as $$
  select to_char(p_inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

create function avisar_participantes(p_reuniao uuid, p_titulo text, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usuario uuid; v_loja uuid;
begin
  select loja_id into v_loja from reunioes where id = p_reuniao;
  for v_usuario in select usuario_id from reuniao_participantes where reuniao_id = p_reuniao loop
    perform avisar(v_usuario, v_loja, p_titulo, p_texto, '/reunioes/' || p_reuniao);
  end loop;
end $$;

create function criar_reuniao(
  p_loja uuid, p_titulo text, p_pauta text, p_inicio timestamptz, p_duracao int, p_local text, p_participantes uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_pessoas uuid[];
  v_pessoa uuid;
begin
  if auth.uid() is null or not gere_loja(p_loja) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if length(trim(coalesce(p_titulo, ''))) = 0 then raise exception 'titulo_obrigatorio'; end if;
  if p_inicio is null then raise exception 'inicio_obrigatorio'; end if;

  v_pessoas := array(select distinct x from unnest(coalesce(p_participantes, '{}') || auth.uid()) as x where x is not null);
  foreach v_pessoa in array v_pessoas loop
    if not membro_da_loja(v_pessoa, p_loja) then raise exception 'participante_invalido'; end if;
  end loop;

  insert into reunioes (empresa_id, loja_id, titulo, pauta, inicio, duracao_min, local, criado_por)
    select empresa_id, p_loja, trim(p_titulo), nullif(trim(p_pauta), ''), p_inicio, coalesce(p_duracao, 60), nullif(trim(p_local), ''), auth.uid()
    from lojas where id = p_loja
    returning id into v_id;
  insert into reuniao_participantes (reuniao_id, usuario_id) select v_id, unnest(v_pessoas);
  perform avisar_participantes(v_id, 'Nova reunião', trim(p_titulo) || ' · ' || quando_sp(p_inicio));
  return v_id;
end $$;

create function registrar_reuniao(p_reuniao uuid, p_aconteceu boolean, p_ata text) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or auth.uid() is null
     or not (gere_loja(r.loja_id) or (eh_participante(r.id, auth.uid()) and membro_da_loja(auth.uid(), r.loja_id))) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if r.cancelada then raise exception 'reuniao_cancelada'; end if;
  if p_aconteceu is null then raise exception 'escolha_se_aconteceu'; end if;
  if p_aconteceu and length(trim(coalesce(p_ata, ''))) = 0 then raise exception 'ata_obrigatoria'; end if;
  update reunioes set aconteceu = p_aconteceu, ata = nullif(trim(p_ata), ''), registrada_por = auth.uid(), registrada_em = now()
    where id = r.id;
end $$;

create function remarcar_reuniao(p_reuniao uuid, p_inicio timestamptz, p_duracao int) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or auth.uid() is null or not gere_loja(r.loja_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.cancelada then raise exception 'reuniao_cancelada'; end if;
  if p_inicio is null then raise exception 'inicio_obrigatorio'; end if;
  update reunioes set inicio = p_inicio, duracao_min = coalesce(p_duracao, duracao_min), sequencia = sequencia + 1
    where id = r.id;
  perform avisar_participantes(r.id, 'Reunião remarcada', r.titulo || ' · ' || quando_sp(p_inicio));
end $$;

create function cancelar_reuniao(p_reuniao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or auth.uid() is null or not gere_loja(r.loja_id) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.cancelada then return; end if;
  update reunioes set cancelada = true, sequencia = sequencia + 1 where id = r.id;
  perform avisar_participantes(r.id, 'Reunião cancelada', r.titulo || ' · ' || quando_sp(r.inicio));
end $$;

create function meu_token_agenda() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if auth.uid() is null then raise exception 'sem_permissao' using errcode = '42501'; end if;
  insert into agenda_tokens (usuario_id) values (auth.uid()) on conflict (usuario_id) do nothing;
  select token into v_token from agenda_tokens where usuario_id = auth.uid();
  return v_token;
end $$;

-- Lembrete 1 h antes; a chave inclui o horário, então remarcar gera lembrete novo.
create function lembrar_reunioes() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select re.id, re.titulo, re.loja_id, re.inicio, p.usuario_id
    from reunioes re join reuniao_participantes p on p.reuniao_id = re.id
    where not re.cancelada and re.inicio > now() and re.inicio <= now() + interval '65 minutes'
      and membro_da_loja(p.usuario_id, re.loja_id)
  loop
    perform avisar_uma_vez(r.usuario_id, r.loja_id, 'Reunião em 1 hora', r.titulo || ' · ' || quando_sp(r.inicio),
      '/reunioes/' || r.id, 'reuniao:' || r.id || ':' || extract(epoch from r.inicio)::bigint || ':' || r.usuario_id);
  end loop;
end $$;

revoke execute on function eh_participante(uuid, uuid), quando_sp(timestamptz), avisar_participantes(uuid, text, text),
  criar_reuniao(uuid, text, text, timestamptz, int, text, uuid[]), registrar_reuniao(uuid, boolean, text),
  remarcar_reuniao(uuid, timestamptz, int), cancelar_reuniao(uuid), meu_token_agenda(), lembrar_reunioes()
  from public, anon, authenticated;
grant execute on function criar_reuniao(uuid, text, text, timestamptz, int, text, uuid[]), registrar_reuniao(uuid, boolean, text),
  remarcar_reuniao(uuid, timestamptz, int), cancelar_reuniao(uuid), meu_token_agenda() to authenticated;
grant execute on function lembrar_reunioes() to service_role;

select cron.schedule('lembrar-reunioes', '*/5 * * * *', 'select public.lembrar_reunioes()');
