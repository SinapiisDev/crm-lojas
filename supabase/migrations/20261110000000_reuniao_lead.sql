-- Reunião com cliente marcada a partir do lead.
-- Fica ligada ao lead (apagar o lead apaga a reunião, como o histórico) e só aparece para quem participa
-- ou enxerga o lead: o título leva o nome do cliente, e leads são privados de cada vendedora.

alter table reunioes add column lead_id uuid references leads on delete cascade;
create index reunioes_lead on reunioes (lead_id) where lead_id is not null;

alter type tipo_evento_lead add value if not exists 'reuniao';

create function participo(p_reuniao uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reuniao_participantes where reuniao_id = p_reuniao and usuario_id = auth.uid())
$$;

-- leads_ver não olha reunioes, então o exists abaixo não entra em recursão.
drop policy reunioes_ver on reunioes;
create policy reunioes_ver on reunioes for select to authenticated using (
  meu_cargo(loja_id) is not null
  and (lead_id is null or participo(id) or exists (select 1 from leads where leads.id = reunioes.lead_id))
);

create function marcar_reuniao_lead(
  p_lead uuid, p_titulo text, p_pauta text, p_inicio timestamptz, p_duracao int, p_local text, p_participantes uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l leads;
  v_id uuid;
  v_pessoas uuid[];
  v_pessoa uuid;
begin
  select * into l from leads where id = p_lead;
  if l.id is null or auth.uid() is null
     or not (ve_todos_leads(l.loja_id) or (l.vendedor_id = auth.uid() and meu_cargo(l.loja_id) = 'vendedor')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_titulo, ''))) = 0 then raise exception 'titulo_obrigatorio'; end if;
  if p_inicio is null then raise exception 'inicio_obrigatorio'; end if;

  -- Quem marca e a vendedora do lead participam sempre.
  v_pessoas := array(select distinct x from unnest(coalesce(p_participantes, '{}') || auth.uid() || l.vendedor_id) as x where x is not null);
  foreach v_pessoa in array v_pessoas loop
    if not membro_da_loja(v_pessoa, l.loja_id) then raise exception 'participante_invalido'; end if;
  end loop;

  insert into reunioes (empresa_id, loja_id, lead_id, titulo, pauta, inicio, duracao_min, local, criado_por)
    values (l.empresa_id, l.loja_id, l.id, trim(p_titulo), nullif(trim(p_pauta), ''), p_inicio, coalesce(p_duracao, 60),
            nullif(trim(p_local), ''), auth.uid())
    returning id into v_id;
  insert into reuniao_participantes (reuniao_id, usuario_id) select v_id, unnest(v_pessoas);

  insert into lead_eventos (lead_id, autor_id, tipo, texto) values (l.id, auth.uid(), 'reuniao', 'Reunião marcada: ' || quando_sp(p_inicio));
  -- Marcar com o cliente é contato: o lead sai da lista de parados.
  update leads set ultimo_contato_em = now() where id = l.id;

  perform avisar_participantes(v_id, 'Nova reunião', trim(p_titulo) || ' · ' || quando_sp(p_inicio));
  return v_id;
end $$;

-- Quem marcou a reunião do lead pode remarcar e cancelar; reunião interna continua só com a gerência.
create function pode_mudar_reuniao(r reunioes) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    gere_loja(r.loja_id)
    or (r.lead_id is not null and r.criado_por = auth.uid() and membro_da_loja(auth.uid(), r.loja_id))
  )
$$;

create or replace function remarcar_reuniao(p_reuniao uuid, p_inicio timestamptz, p_duracao int) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or not pode_mudar_reuniao(r) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.cancelada then raise exception 'reuniao_cancelada'; end if;
  if p_inicio is null then raise exception 'inicio_obrigatorio'; end if;
  update reunioes set inicio = p_inicio, duracao_min = coalesce(p_duracao, duracao_min), sequencia = sequencia + 1
    where id = r.id;
  perform avisar_participantes(r.id, 'Reunião remarcada', r.titulo || ' · ' || quando_sp(p_inicio));
end $$;

create or replace function cancelar_reuniao(p_reuniao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reunioes;
begin
  select * into r from reunioes where id = p_reuniao;
  if r.id is null or not pode_mudar_reuniao(r) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if r.cancelada then return; end if;
  update reunioes set cancelada = true, sequencia = sequencia + 1 where id = r.id;
  perform avisar_participantes(r.id, 'Reunião cancelada', r.titulo || ' · ' || quando_sp(r.inicio));
end $$;

revoke execute on function participo(uuid), pode_mudar_reuniao(reunioes),
  marcar_reuniao_lead(uuid, text, text, timestamptz, int, text, uuid[]) from public, anon, authenticated;
grant execute on function participo(uuid), marcar_reuniao_lead(uuid, text, text, timestamptz, int, text, uuid[]) to authenticated;
