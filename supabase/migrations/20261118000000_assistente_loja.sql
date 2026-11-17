-- Assistente que enxerga a loja: memória confirmada pela gerência, sugestões do dia (gravadas pela rotina da IA)
-- e conversa salva por pessoa (servidor é a fonte da verdade).

create table memorias_ia (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300),
  criado_por uuid not null references perfis,
  criado_em timestamptz not null default now()
);
create index memorias_ia_loja on memorias_ia (loja_id);
alter table memorias_ia enable row level security;
create policy memorias_ia_ver on memorias_ia for select to authenticated using (gere_loja(loja_id));
create policy memorias_ia_criar on memorias_ia for insert to authenticated with check (gere_loja(loja_id) and criado_por = auth.uid());
create policy memorias_ia_apagar on memorias_ia for delete to authenticated using (gere_loja(loja_id));
revoke all on memorias_ia from anon, authenticated;
grant select, insert, delete on memorias_ia to authenticated;

create table sugestoes_ia (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references lojas on delete cascade,
  dia date not null,
  itens jsonb not null,
  criado_em timestamptz not null default now(),
  unique (loja_id, dia)
);
alter table sugestoes_ia enable row level security;
create policy sugestoes_ia_ver on sugestoes_ia for select to authenticated using (gere_loja(loja_id));
revoke all on sugestoes_ia from anon, authenticated;
grant select on sugestoes_ia to authenticated;

create table conversas_ia (
  usuario_id uuid primary key references perfis on delete cascade,
  mensagens jsonb not null default '[]',
  tarefas jsonb not null default '[]',
  leads jsonb not null default '[]',
  memorias jsonb not null default '[]',
  atualizado_em timestamptz not null default now()
);
alter table conversas_ia enable row level security;
create policy conversas_ia_dono on conversas_ia for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
revoke all on conversas_ia from anon, authenticated;
grant select, insert, update, delete on conversas_ia to authenticated;
