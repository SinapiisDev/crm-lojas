-- WhatsApp da loja (API oficial, modo coexistência): mensagens chegam pelo webhook e são ligadas ao lead pelo telefone.
-- Só o servidor grava (chave secreta); pelo app a pessoa só lê, e só o que é do lead que ela enxerga.

-- Número de WhatsApp de cada loja (phone_number_id da Meta). Cadastrado pela dona no SQL Editor (ver README).
create table whatsapp_numeros (
  phone_number_id text primary key,
  loja_id uuid not null unique references lojas on delete cascade,
  numero text not null
);

create table whatsapp_mensagens (
  id text primary key, -- wamid da Meta: a mesma mensagem nunca entra duas vezes
  loja_id uuid not null references lojas on delete cascade,
  lead_id uuid references leads on delete set null,
  contato text not null, -- número do cliente, só dígitos com DDI
  de_cliente boolean not null, -- true: cliente mandou; false: loja mandou (app do celular)
  tipo text not null,
  texto text check (length(texto) <= 4000),
  enviada_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index whatsapp_mensagens_lead on whatsapp_mensagens (lead_id, enviada_em desc);

-- Mesma pessoa, formatos diferentes: "(11) 98888-7777", "5511988887777" e "551188887777" (WhatsApp às vezes sem o 9).
-- Chave = DDD + 8 últimos dígitos para celular/fixo do Brasil; outros países ficam com todos os dígitos.
create function telefone_chave(p text) returns text language sql immutable as $$
  select case
    when length(d) in (12, 13) and d like '55%' then substr(d, 3, 2) || right(d, 8)
    when length(d) in (10, 11) then substr(d, 1, 2) || right(d, 8)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
create index leads_telefone_chave on leads (loja_id, telefone_chave(telefone));
-- Do lado do WhatsApp o número sempre vem com DDI: só +55 vira chave brasileira. Estrangeiro (ex.: +1 212..., 11 dígitos)
-- ganha prefixo "x" e nunca coincide com um lead brasileiro.
create function contato_chave(p text) returns text language sql immutable as $$
  select case when length(d) in (12, 13) and d like '55%' then substr(d, 3, 2) || right(d, 8) else 'x' || d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;
create index whatsapp_mensagens_contato on whatsapp_mensagens (loja_id, contato_chave(contato), enviada_em desc);

-- Conversa fica no lead em que já está (se ainda aberto): lead novo com o mesmo telefone não "rouba" a conversa.
-- Sem conversa ligada: lead aberto mais recente com esse telefone na loja.
create function lead_do_telefone(p_loja uuid, p_contato text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.lead_id from whatsapp_mensagens m join leads l on l.id = m.lead_id
      where m.loja_id = p_loja and contato_chave(m.contato) = contato_chave(p_contato) and l.etapa not in ('vendido', 'perdido')
      order by m.enviada_em desc limit 1),
    (select id from leads
      where loja_id = p_loja and telefone_chave(telefone) = contato_chave(p_contato)
      order by (etapa not in ('vendido', 'perdido')) desc, atualizado_em desc
      limit 1)
  )
$$;

create function whatsapp_mensagens_antes_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is null then new.lead_id := lead_do_telefone(new.loja_id, new.contato); end if;
  return new;
end $$;
create trigger whatsapp_mensagens_antes_gravar before insert on whatsapp_mensagens
  for each row execute function whatsapp_mensagens_antes_gravar();

-- Mensagem mandada pela loja é contato: o lead sai da lista de parados.
create function whatsapp_mensagens_depois_gravar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.de_cliente and new.lead_id is not null then
    update leads set ultimo_contato_em = greatest(ultimo_contato_em, new.enviada_em) where id = new.lead_id;
  end if;
  return null;
end $$;
create trigger whatsapp_mensagens_depois_gravar after insert on whatsapp_mensagens
  for each row execute function whatsapp_mensagens_depois_gravar();

-- Lead cadastrado (ou telefone corrigido) depois da conversa começar: puxa as mensagens soltas.
-- Telefone corrigido: solta as conversas que não são mais dele e religa cada uma onde couber.
create function leads_liga_whatsapp() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_chaves text[] := array[telefone_chave(new.telefone)];
begin
  if tg_op = 'UPDATE' then
    with soltas as (
      update whatsapp_mensagens set lead_id = null
        where lead_id = new.id and contato_chave(contato) <> telefone_chave(new.telefone)
        returning contato_chave(contato) as chave
    )
    select v_chaves || coalesce(array_agg(distinct chave), '{}') into v_chaves from soltas;
  end if;
  update whatsapp_mensagens set lead_id = lead_do_telefone(loja_id, contato)
    where loja_id = new.loja_id and lead_id is null and contato_chave(contato) = any (v_chaves);
  return null;
end $$;
create trigger leads_liga_whatsapp after insert or update of telefone on leads
  for each row execute function leads_liga_whatsapp();

alter table whatsapp_numeros enable row level security;
alter table whatsapp_mensagens enable row level security;

create policy whatsapp_numeros_ver on whatsapp_numeros for select to authenticated using (gere_loja(loja_id));
-- leads_ver não olha whatsapp_mensagens: sem recursão.
create policy whatsapp_mensagens_ver on whatsapp_mensagens for select to authenticated using (
  gere_loja(loja_id) or (lead_id is not null and exists (select 1 from leads where leads.id = whatsapp_mensagens.lead_id))
);

revoke all on whatsapp_numeros, whatsapp_mensagens from anon, authenticated;
grant select on whatsapp_numeros, whatsapp_mensagens to authenticated;

revoke execute on function lead_do_telefone(uuid, text), whatsapp_mensagens_antes_gravar(),
  whatsapp_mensagens_depois_gravar(), leads_liga_whatsapp() from public, anon, authenticated;

-- Função pura usada no índice de leads: quem grava lead (vendedora) precisa poder executá-la.
revoke execute on function telefone_chave(text), contato_chave(text) from public, anon;
grant execute on function telefone_chave(text), contato_chave(text) to authenticated;

alter publication supabase_realtime add table whatsapp_mensagens;
