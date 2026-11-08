# Plano 3 — Painel da dona

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/painel` para dona/sócios e gerente com números de leads e vendas por loja, tarefas atrasadas com Cobrar, tarefas por pessoa e vendas por vendedora, filtrável por loja e período.

**Architecture:** Server Component busca linhas cruas (o RLS já limita ao que a pessoa pode ver) e funções puras em `src/lib/regras/painel.ts` agregam. Sem migration nova.

**Tech Stack:** igual aos planos anteriores.

**Spec:** `docs/superpowers/specs/2026-11-07-crm-lojas-design.md` §6 (esboço aprovado), §3 (acessos).

**Fora deste plano:** bloco de Reuniões (Plano 5); resumo da IA (Plano 6).

## Global Constraints

- Acesso: só quem é `dono` ou `gerente` em pelo menos uma loja. O painel considera só as lojas onde a pessoa é dono/gerente. Vendedora/conferente: menu sem "Painel" e `/painel` responde 404.
- Filtro de loja: "Todas as lojas" (só se gere mais de uma) + cada loja. Filtro de período: **Últimos 7 dias** (padrão) e **Últimos 30 dias**, comparando com os 7/30 dias anteriores.
- Datas em `America/Sao_Paulo`. Período de N dias = de `hoje - (N-1)` até `hoje`, inclusive.
- Leads novos = `criado_em` no período. Vendidos = `etapa = vendido` com `fechado_em` no período. Valor vendido = soma de `valor_vendido` desses. Conversão = vendidos ÷ leads novos (0% se não houve novos), inteiro arredondado.
- Leads parados = situação de agora (não do período), regra `leadParado` com `dias_lead_parado` da loja.
- Tarefas atrasadas = agora: `status <> feito` e `prazo < hoje`, mais antiga primeiro, com botão Cobrar (componente do Plano 2).
- Tarefas por pessoa (prazo no período): feitas no prazo (`feito` e dia da conclusão ≤ prazo), atrasadas (feitas depois do prazo, ou abertas com prazo < hoje), abertas (não feitas com prazo ≥ hoje).
- Vendas por vendedora (no período): leads novos, vendidos, valor.
- `/` leva dono/gerente para `/painel` e os outros para `/leads`; login vai para `/`.

## Review Focus

- Gerente da Loja 1 que também é vendedora da Loja 2 → painel mostra só Loja 1.
- Período sem nenhum lead → conversão 0%, sem divisão por zero, setas sem "NaN".
- Lead criado às 23h30 do último dia (horário SP) conta dentro do período.
- Venda feita no período de um lead criado antes do período conta em vendidos, não em novos.
- `?loja=<id de loja alheia>` na URL → cai em "Todas" (não mostra nada de fora).

---

### Task 1: Regras do painel

**Files:** Create `src/lib/regras/painel.ts`, `src/lib/regras/painel.test.ts`

**Interfaces (Produces):**
- `type Periodo = { dias: 7 | 30; inicio: string; fim: string; inicioAnterior: string }`; `periodo(dias: 7 | 30, hoje: string): Periodo`
- `diaSP(iso: string): string`
- `resumoPorLoja(lojas: LojaPainel[], leads: LeadPainel[], p: Periodo, agora?: Date): LinhaLoja[]` — uma linha por loja + `total` com `{ id, nome, novos, novosAnterior, vendidos, conversao, valorVendido, parados }`.
- `tarefasAtrasadas(tarefas: TarefaPainel[], hoje: string): TarefaPainel[]`
- `tarefasPorPessoa(tarefas: TarefaPainel[], p: Periodo, hoje: string): { pessoa: string; feitasNoPrazo: number; atrasadas: number; abertas: number }[]`
- `vendasPorVendedora(leads: LeadPainel[], p: Periodo): { vendedor: string; novos: number; vendidos: number; valor: number }[]`

- [ ] **Step 1: testes** com os casos do Review Focus (23h30 SP, venda de lead antigo, período vazio) + `periodo(7, "2026-11-10")` = `{inicio: "2026-11-04", fim: "2026-11-10", inicioAnterior: "2026-10-28"}`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5:** commit.

### Task 2: Página `/painel`, menu e entrada

**Files:** Create `src/app/(app)/painel/page.tsx`, `src/components/painel/*.tsx`, `tests/e2e/painel.spec.ts`; Modify `src/app/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/*/route.ts` e `src/app/login/actions.ts` (destino `/`), `src/app/(app)/menu.tsx`, `src/app/(app)/layout.tsx`, `tests/e2e/ajuda.ts` (`entrar` aceita destino).

- [ ] **Step 1: e2e**: `dona vê números da semana por loja e total`; `gerente vê só a loja dela`; `vendedora não vê Painel e /painel é 404`; `cobrar tarefa atrasada pelo painel`; `trocar para 30 dias`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (layout do esboço: tabela por loja; 4 blocos em grade; celular em coluna única). **Step 4:** PASS + suíte inteira + lint + build. **Step 5:** commit.
