# Alerta de leads parados — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dona recebe às 8h, no celular, até 5 avisos de leads parados com telefone e mensagem sugerida; tocar abre o WhatsApp do lead com a mensagem escrita.

**Architecture:** Uma regra única de "parado" (cliente: prazo da loja; parceiro: 15 dias; qualquer etapa aberta) em TS (`leadParado`) e espelhada em SQL (`rotina_diaria`). A rotina SQL escolhe os 5 mais urgentes por pessoa. O link do aviso aponta para uma rota do próprio CRM que confere o login e redireciona para `wa.me`.

**Tech Stack:** Next.js (route handler), Supabase (plpgsql + pg_cron), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-alerta-leads-parados-design.md`

## Global Constraints

- Etapas abertas: `novo`, `em_contato`, `orcamento_enviado`, `negociacao`. `vendido`/`perdido` nunca são parados.
- Cliente parado: dias sem contato ≥ `lojas.dias_lead_parado`. Parceiro parado: ≥ 15 (`DIAS_PARCEIRO_PARADO = 15`).
- Máximo 5 avisos de parado por pessoa por rotina, mais um aviso "E mais N leads parados" (link `/leads`) quando houver mais.
- Ordem: cliente antes de parceiro; `negociacao` > `orcamento_enviado` > `em_contato` > `novo`; mais antigo `ultimo_contato_em` primeiro.
- Título do aviso continua `Lead parado: <nome>` (testes e avisos existentes dependem dele; o design curto dizia "Parado:", decisão: manter o atual).
- Texto: `Sem contato há N dias.` + (se telefone) ` Tel. <telefone formatado>.` + ` ` + sugestão da IA (`Sugestão: "<sugestao_ia>"`) ou, sem ela, `resumo_ia`, ou `Entre em contato de novo.`
- O service worker continua abrindo só páginas do CRM; nada de link externo em `notificacoes.link`.
- Migrações em produção: `npx supabase db push --remote` (CLI v3).

## Review Focus

- Telefone com formato estranho (fixo de 10 dígitos, com +55, curto demais): o texto mostra o telefone cru quando não formata; o link usa `linkWhatsApp`, que devolve `null` para número inválido → rota cai na página do lead. Teste na Task 3 (telefone `123` → redireciona para `/leads/<id>`).
- Sugestão com aspas, acentos e emoji: precisa chegar intacta ao WhatsApp (`linkWhatsApp` codifica). Teste na Task 3 com `Oi "Ana", tudo bem? 😊`.
- Vendedora tentando abrir `/leads/<id>/whatsapp` de lead da colega: RLS esconde o lead → redireciona para `/leads`, sem vazar telefone. Teste na Task 3.
- Muitos parceiros parados no mesmo dia (importação em massa): no máximo 5 + 1 avisos. Teste na Task 2.
- Lead parado de outra pessoa da mesma loja não entra na cota de quem não é responsável. Teste na Task 2 (cota por `vendedor_id`).

---

### Task 1: Regra única de lead parado (TS) e IA ciente do tipo

**Files:**
- Modify: `src/lib/regras/leads.ts:55-62` (`leadParado`), adicionar `DIAS_PARCEIRO_PARADO`
- Modify: `src/lib/regras/painel.ts` (`LeadPainel` ganha `tipo`), `src/app/(app)/painel/page.tsx:62` (select inclui `tipo`)
- Modify: `src/components/leads/card-lead.tsx:37` (passa o lead com `tipo`; `LeadResumo` já tem)
- Modify: `src/lib/ia/semana.ts` (`rotinaIA`: `.in("etapa", [os 4 abertos])`, select inclui `tipo`, filtro com a regra nova)
- Modify: `src/lib/ia/leads.ts` (`DadosLead.tipo: TipoLead`; select de `atualizarLeadIA` inclui `tipo`; linha `Tipo:` no prompt; regra de parceiro no `SISTEMA_LEAD`)
- Test: `src/lib/regras/leads.test.ts`, `tests/ia.test.ts`

**Interfaces:**
- Produces: `leadParado(lead: { etapa: Etapa; ultimo_contato_em: string; tipo: TipoLead }, diasLimite: number, agora?: Date): boolean` e `export const DIAS_PARCEIRO_PARADO = 15`.
- Produces: `promptLead` escreve `Tipo: Cliente` ou `Tipo: Parceiro (indica clientes: arquiteto, construtora, imobiliária ou corretor)`.

- [ ] **Step 1: Testes que falham** em `leads.test.ts` (`describe("leadParado")`, substituir os casos atuais):
  - cliente `novo` há 2 dias, limite 2 → `true`; cliente `em_contato` há 1 dia → `false`
  - parceiro `em_contato` há 14 dias, limite 2 → `false`; há 15 → `true`
  - cliente e parceiro `vendido`/`perdido` há 30 dias → `false`

  Em `tests/ia.test.ts`: `promptLead({ ...dados, tipo: "parceiro" })` contém `Tipo: Parceiro`; `SISTEMA_LEAD` contém `parceiro`.
- [ ] **Step 2:** `npx vitest run src/lib/regras/leads.test.ts tests/ia.test.ts` → FAIL (tipo ausente / regra antiga).
- [ ] **Step 3: Implementar.** Regra nova em `leadParado`; ajustar os três chamadores; no `SISTEMA_LEAD`, acrescentar: para parceiro, a sugestão fala de parceria e indicação de clientes, nunca de compra de móveis.
- [ ] **Step 4:** `npx tsc --noEmit && npx vitest run src/lib/regras/leads.test.ts tests/ia.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(leads): parado vale para toda etapa aberta; parceiro com 15 dias`

### Task 2: Rotina diária com os 5 mais urgentes

**Files:**
- Create: `supabase/migrations/20261117000000_alerta_parados.sql`
- Test: `tests/avisos.test.ts`

**Interfaces:**
- Consumes: regra e constantes da Task 1 (espelhadas em SQL).
- Produces: `formatar_telefone(text) returns text` (11 dígitos → `(42) 99914-3583`, 10 → `(42) 3036-1683`, senão o texto como veio) e `rotina_diaria()` recriada.

- [ ] **Step 1: Testes que falham** em `tests/avisos.test.ts`, cada um com uma vendedora nova criada no próprio teste (a cota é por pessoa):
  - `"no máximo 5 avisos de parado por pessoa e um resumo do resto"`: 7 clientes `negociacao` parados há 3 dias → 5 avisos `Lead parado:` + 1 com título `E mais 2 leads parados` e link `/leads`.
  - `"parceiro só para depois de 15 dias"`: parceiro `em_contato` há 10 dias → sem aviso; há 16 dias → aviso.
  - `"aviso traz telefone, sugestão e link do WhatsApp"`: telefone `42999143583`, `sugestao_ia` `Oi Ana, tudo bem?` → texto `Sem contato há 3 dias. Tel. (42) 99914-3583. Sugestão: "Oi Ana, tudo bem?"`, link `/leads/<id>/whatsapp`.
  - `"cliente em contato parado também avisa"`: `em_contato` há 3 dias → aviso.
  - Os testes atuais (`Entre em contato de novo.`, resumo da IA em `tests/ia.test.ts`) continuam passando sem mudança.
- [ ] **Step 2:** `npx vitest run tests/avisos.test.ts` → FAIL.
- [ ] **Step 3: Migração.** `formatar_telefone` (`immutable`). `rotina_diaria()` recriada copiando de `supabase/migrations/20261109100000_ia.sql:63-100` as partes de véspera e atraso sem mudança; a parte de parados troca por:

```sql
for r in
  select p.*, count(*) over (partition by p.vendedor_id) as total,
         row_number() over (partition by p.vendedor_id
           order by (p.tipo = 'parceiro'),
                    array_position(array['negociacao','orcamento_enviado','em_contato','novo']::etapa_lead[], p.etapa),
                    p.ultimo_contato_em) as pos
  from (
    select l.* from leads l join lojas j on j.id = l.loja_id
    where l.etapa in ('novo','em_contato','orcamento_enviado','negociacao')
      and l.ultimo_contato_em <= now() - make_interval(days => case when l.tipo = 'parceiro' then 15 else j.dias_lead_parado end)
  ) p
loop
  -- pos 1..5: aviso do lead (chave 'parado:'||id||':'||hoje); pos 6: 'E mais '||(total-5)||' leads parados', link '/leads', chave 'parados:'||vendedor_id||':'||hoje
end loop;
```

  Link: `'/leads/'||id||'/whatsapp'` quando `nullif(trim(telefone),'')` existe, senão `'/leads/'||id`.
  `shortcut:` comentário na migração: cota conta por execução; rodar a rotina duas vezes no mesmo dia pode passar de 5 se a ordem mudar (produção roda 1x/dia).
- [ ] **Step 4:** `npx supabase db reset` e `npx vitest run tests/avisos.test.ts tests/ia.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(avisos): até 5 leads parados por pessoa, com telefone e sugestão`

### Task 3: Rota que abre o WhatsApp com a sugestão

**Files:**
- Create: `src/app/(app)/leads/[id]/whatsapp/route.ts`
- Test: `tests/e2e/leads.spec.ts`

**Interfaces:**
- Consumes: `linkWhatsApp(telefone, texto)` de `src/lib/regras/leads.ts`; `criarClienteServidor()` (RLS do usuário logado).
- Produces: `GET /leads/<id>/whatsapp` → 307 para `wa.me`, `/leads/<id>` ou `/leads`.

- [ ] **Step 1: Testes e2e que falham** (usar `page.request.get(url, { maxRedirects: 0 })` após `entrar`):
  - dona, lead com telefone `42999143583` e sugestão `Oi "Ana", tudo bem? 😊` → status 307, `location` = `linkWhatsApp("42999143583", 'Oi "Ana", tudo bem? 😊')`.
  - lead com telefone `123` → `location` termina em `/leads/<id>`.
  - vendedora A abrindo lead da vendedora B → `location` termina em `/leads` e não contém o telefone.
- [ ] **Step 2:** `npx playwright test tests/e2e/leads.spec.ts` → FAIL (404).
- [ ] **Step 3: Implementar** `GET(request, { params })`: `select("telefone, sugestao_ia").eq("id", id).maybeSingle()` com o cliente do servidor; sem lead → redirect `/leads`; `linkWhatsApp(telefone ?? "", sugestao_ia ?? undefined)` nulo → `/leads/<id>`; senão redirect para o link. Usar `NextResponse.redirect(new URL(..., request.url))` para caminhos internos.
- [ ] **Step 4:** `npx playwright test tests/e2e/leads.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat(leads): rota que abre o WhatsApp do lead com a sugestão`

### Task 4: Verificação e produção

- [ ] `npm run lint && npx tsc --noEmit && npm test && npx playwright test` → tudo verde.
- [ ] PR, CI verde, merge (com ok do usuário).
- [ ] `npx supabase db push --remote` e conferir: `select prosrc like '%formatar_telefone%' from pg_proc where proname = 'rotina_diaria'` → `true`.
- [ ] Contar quantos avisos sairiam amanhã sem enviar: consulta read-only com a mesma regra, por vendedora (esperado ≤ 6 cada).
