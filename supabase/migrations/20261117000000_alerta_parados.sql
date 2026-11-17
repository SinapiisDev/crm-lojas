-- Alerta de leads parados: qualquer etapa aberta (cliente no prazo da loja, parceiro em 15 dias),
-- no máximo 5 avisos por pessoa (os mais urgentes) e um "E mais N" com o resto.
-- O aviso traz telefone e a sugestão da IA; o link abre /leads/<id>/whatsapp, que redireciona para o WhatsApp.
-- Mesma regra de leadParado() em src/lib/regras/leads.ts.

-- Igual a formatarTelefone() em src/lib/formatar.ts; formato desconhecido volta como veio.
create or replace function formatar_telefone(p text) returns text
language sql immutable as $$
  select case length(d)
    when 11 then '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 5) || '-' || substr(d, 8)
    when 10 then '(' || substr(d, 1, 2) || ') ' || substr(d, 3, 4) || '-' || substr(d, 7)
    else p
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create or replace function rotina_diaria() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := hoje_sp();
  r record;
  v_pessoa uuid;
  v_dias int;
  v_tel text;
begin
  -- shortcut: a cota conta por execução; rodar duas vezes no mesmo dia pode passar de 5 se a ordem mudar (produção roda 1x/dia).
  for r in
    select p.*,
           count(*) over (partition by p.vendedor_id) as total,
           row_number() over (
             partition by p.vendedor_id
             order by (p.tipo = 'parceiro'),
                      array_position(array['negociacao', 'orcamento_enviado', 'em_contato', 'novo']::etapa_lead[], p.etapa),
                      p.ultimo_contato_em
           ) as pos
    from (
      select l.id, l.nome, l.vendedor_id, l.loja_id, l.etapa, l.tipo, l.telefone, l.ultimo_contato_em, l.resumo_ia, l.sugestao_ia
      from leads l join lojas j on j.id = l.loja_id
      where l.etapa in ('novo', 'em_contato', 'orcamento_enviado', 'negociacao')
        and l.ultimo_contato_em <= now() - make_interval(days => case when l.tipo = 'parceiro' then 15 else j.dias_lead_parado end)
    ) p
  loop
    if r.pos <= 5 then
      v_dias := floor(extract(epoch from now() - r.ultimo_contato_em) / 86400)::int;
      v_tel := nullif(trim(r.telefone), '');
      perform avisar_uma_vez(r.vendedor_id, r.loja_id, 'Lead parado: ' || r.nome,
        'Sem contato há ' || v_dias || ' dias.'
          || coalesce(' Tel. ' || formatar_telefone(v_tel) || '.', '')
          || ' ' || coalesce('Sugestão: "' || nullif(trim(r.sugestao_ia), '') || '"', nullif(trim(r.resumo_ia), ''), 'Entre em contato de novo.'),
        '/leads/' || r.id || case when v_tel is not null then '/whatsapp' else '' end,
        'parado:' || r.id || ':' || v_hoje);
    elsif r.pos = 6 then
      perform avisar_uma_vez(r.vendedor_id, r.loja_id, 'E mais ' || (r.total - 5) || ' leads parados',
        'Veja todos na tela de Leads.', '/leads', 'parados:' || r.vendedor_id || ':' || v_hoje);
    end if;
  end loop;

  for r in select id, titulo, responsavel_id, loja_id, prazo from tarefas where status <> 'feito' and prazo = v_hoje + 1 loop
    perform avisar_uma_vez(r.responsavel_id, r.loja_id, 'Tarefa vence amanhã', r.titulo,
      '/tarefas/' || r.id, 'vespera:' || r.id || ':' || r.prazo);
  end loop;

  for r in select id, titulo, responsavel_id, loja_id, prazo from tarefas where status <> 'feito' and prazo < v_hoje loop
    for v_pessoa in
      select r.responsavel_id
      union
      select usuario_id from membros where loja_id = r.loja_id and cargo in ('dono', 'gerente')
    loop
      perform avisar_uma_vez(v_pessoa, r.loja_id, 'Tarefa atrasada',
        r.titulo || ' · venceu ' || to_char(r.prazo, 'DD/MM'),
        '/tarefas/' || r.id, 'atraso:' || r.id || ':' || r.prazo || ':' || v_pessoa);
    end loop;
  end loop;
end $$;
