-- Fila da rotina da IA calculada no banco: só leads parados que precisam de (nova) análise, na ordem de urgência
-- do aviso das 8h (cliente antes de parceiro, etapa mais avançada, contato mais antigo). Antes a fila vinha dos
-- 1000 contatos mais antigos de todas as lojas e só depois filtrava: com muitos leads já analisados, vinha vazia.
-- Mesma regra de leadParado() em src/lib/regras/leads.ts e de rotina_diaria().
create or replace function fila_ia(p_limite int) returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select l.id
  from leads l join lojas j on j.id = l.loja_id
  where l.etapa in ('novo', 'em_contato', 'orcamento_enviado', 'negociacao')
    and l.ultimo_contato_em <= now() - make_interval(days => case when l.tipo = 'parceiro' then 15 else j.dias_lead_parado end)
    -- Nunca analisado, contato novo depois da análise, ou análise com mais de 3 dias.
    and (l.ia_em is null or l.ia_em < l.ultimo_contato_em or l.ia_em < now() - interval '3 days')
  order by (l.tipo = 'parceiro'),
           array_position(array['negociacao', 'orcamento_enviado', 'em_contato', 'novo']::etapa_lead[], l.etapa),
           l.ultimo_contato_em,
           l.id
  limit p_limite
$$;

revoke execute on function fila_ia(int) from public, anon, authenticated;
grant execute on function fila_ia(int) to service_role;
