# Plano 2 — Tarefas por pessoa, botão Cobrar e avisos no app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quadro de tarefas com colunas por pessoa, prazos com cor, conclusão registrada, tarefas recorrentes e o fluxo Cobrar → Concluir / Pedir novo prazo → Aprovar / Recusar, com avisos dentro do app (sino).

**Architecture:** Mesmo padrão do Plano 1: regra de acesso e de fluxo no Postgres (RLS + triggers + funções `security definer` chamadas por RPC), Server Actions finas, UI em Server Components com ilhas client. Avisos ficam numa tabela `notificacoes`; o Plano 4 só acrescenta entrega por push/e-mail sobre ela.

**Tech Stack:** igual ao Plano 1 (Next 16.4, Supabase, shadcn base-nova, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-07-crm-lojas-design.md` §3, §5 (parte de tarefas e Cobrar), §6 (insumo do painel).

**Fora deste plano:** reuniões/Google Agenda (Plano 5); lembrete na véspera, aviso de atraso automático, push e e-mail (Plano 4, via cron sobre `notificacoes`); painel (Plano 3).

## Global Constraints

- Todos da loja veem todas as tarefas da loja (inclusive conferente). Ninguém vê tarefa de loja em que não está.
- Criar tarefa para outra pessoa, editar título/descrição/prazo/responsável/recorrência, apagar, Cobrar e aprovar/recusar prazo: só `dono` e `gerente` da loja.
- Responsável muda só o status (`a_fazer`, `fazendo`, `feito`) e pede novo prazo (motivo obrigatório, data ≥ hoje).
- `prazo` é `date`; "hoje" é sempre `America/Sao_Paulo`.
- Concluir registra `concluida_por` e `concluida_em`; sair de `feito` limpa os dois.
- Toda mudança de `prazo` incrementa `prazo_alterado_vezes`.
- Recorrente (`diaria`, `semanal`, `mensal`) cria a próxima ocorrência ao ser concluída (prazo + 1 dia / 7 dias / 1 mês), uma única vez.
- Cobrança grava evento na tarefa e aviso para o responsável. Mensagem pré-preenchida editável: `Oi {primeiro nome}, a tarefa "{título}" venceu há {N} dias. Me dá um retorno até hoje?` (ou `vence hoje` / `vence em {dd/mm}` quando não atrasada).
- Avisos (`notificacoes`): cada pessoa vê e marca como lidos só os próprios; ninguém insere direto (só triggers/funções).
- Cores do card: vermelho = atrasada; amarelo = vence hoje ou amanhã; feita = esmaecida com ✓.

## Review Focus

- Vendedora mudando o prazo da própria tarefa por chamada direta à API (sem passar pelo pedido) → recusado.
- Vendedora chamando a RPC de cobrar ou de aprovar prazo → recusado.
- Concluir tarefa recorrente duas vezes (concluir, reabrir, concluir) → não duplica a próxima ocorrência.
- Pedido de novo prazo com data no passado ou motivo em branco → recusado.
- Tarefa cujo responsável saiu da loja / pessoa de outra loja como responsável → recusado na criação.

---

### Task 1: Banco — tarefas, eventos, avisos e funções

**Files:** Create `supabase/migrations/20261108100000_tarefas.sql`, `tests/tarefas.test.ts`

**Interfaces (Produces):**
- Enums `status_tarefa(a_fazer, fazendo, feito)`, `recorrencia_tarefa(diaria, semanal, mensal)`, `tipo_evento_tarefa(criada, status, cobranca, prazo_pedido, prazo_aprovado, prazo_recusado, prazo_alterado)`.
- `tarefas(id, empresa_id, loja_id, titulo, descricao, responsavel_id, criado_por, prazo date, status, recorrencia, concluida_em, concluida_por, prazo_alterado_vezes int default 0, prazo_pedido date, criado_em, atualizado_em)`.
- `tarefa_eventos(id, tarefa_id, autor_id, tipo, texto, prazo date, criado_em)`.
- `notificacoes(id, usuario_id, loja_id, titulo, texto, link, lida_em, criado_em)`.
- SQL: `hoje_sp() returns date`; RPCs `cobrar_tarefa(p_tarefa uuid, p_mensagem text)`, `pedir_novo_prazo(p_tarefa uuid, p_prazo date, p_motivo text)`, `decidir_novo_prazo(p_tarefa uuid, p_aprovar boolean)`, `marcar_avisos_lidos()`.
- Trigger `tarefas_antes_gravar`: empresa da loja; não-gestor só muda `status`; conta mudanças de prazo; conclusão. Trigger `tarefas_depois_gravar`: evento `criada`/`status`, aviso ao responsável quando outra pessoa cria, próxima ocorrência da recorrente.

- [ ] **Step 1: testes** em `tests/tarefas.test.ts` (mesmo padrão de `tests/rls.test.ts`):
  - `todos da loja veem as tarefas da loja; outra loja não`
  - `vendedora cria tarefa para si e não para colega`
  - `responsável de outra loja é recusado`
  - `gerente cria tarefa para vendedora e ela recebe aviso`
  - `responsável não muda prazo nem título direto`
  - `gerente muda prazo e o contador sobe`
  - `concluir registra quem e quando; reabrir limpa`
  - `recorrente semanal cria a próxima com prazo +7 uma única vez`
  - `vendedora não cobra; gerente cobra e responsável recebe aviso`
  - `pedido de prazo exige motivo e data futura; só o responsável pede`
  - `aprovar troca o prazo e avisa; recusar mantém`
  - `vendedora não aprova prazo`
  - `cada um vê só os próprios avisos e marca como lidos`
- [ ] **Step 2:** `npx vitest run tests/tarefas.test.ts` → FAIL (tabela não existe).
- [ ] **Step 3:** migration.
- [ ] **Step 4:** `npx supabase db reset && npx vitest run` → PASS (todos, incluindo Plano 1).
- [ ] **Step 5:** commit `feat(db): tarefas, cobrança, pedido de prazo e avisos`.

### Task 2: Regras puras de tarefas

**Files:** Create `src/lib/regras/tarefas.ts`, `src/lib/regras/tarefas.test.ts`

**Interfaces (Produces):**
- `hojeSP(agora?: Date): string` (`YYYY-MM-DD` em America/Sao_Paulo)
- `situacaoPrazo(prazo: string, status: StatusTarefa, hoje: string): "feita" | "atrasada" | "hoje" | "amanha" | "ok"`
- `diasEntre(de: string, ate: string): number`
- `textoPrazo(prazo: string, status: StatusTarefa, hoje: string): string` — `"atrasada há 3 dias"`, `"atrasada há 1 dia"`, `"vence hoje"`, `"vence amanhã"`, `"vence 14/11"`, `"feita"`.
- `mensagemCobranca(nome: string, titulo: string, prazo: string, hoje: string): string`
- `STATUS_TAREFA`, `RECORRENCIAS` (id + título pt-BR).

- [ ] **Step 1: testes**: `hojeSP` às 23h30 de SP (02h30 UTC do dia seguinte) devolve o dia de SP; `situacaoPrazo` para ontem/hoje/amanhã/+5/feita; `textoPrazo` nos 6 textos acima; `mensagemCobranca("Bruno Lima", "Orçamento Sr. Paulo", ontem-2, hoje)` = `Oi Bruno, a tarefa "Orçamento Sr. Paulo" venceu há 3 dias. Me dá um retorno até hoje?`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5:** commit `feat(tarefas): regras de prazo e mensagem de cobrança`.

### Task 3: Quadro de tarefas por pessoa + nova tarefa

**Files:** Create `src/app/(app)/tarefas/page.tsx`, `src/app/(app)/tarefas/actions.ts`, `src/components/tarefas/card-tarefa.tsx`, `src/components/tarefas/nova-tarefa.tsx`, `src/components/tarefas/filtros.tsx`; Modify `src/app/(app)/menu.tsx` (item Tarefas), `src/components/leads/ao-vivo.tsx` → genérico `AoVivo({ tabela, lojaId })`.

**Interfaces:**
- Consumes: Task 2; `obterSessao`, `podeGerir`.
- Produces actions: `criarTarefa(prev, form) → Resultado`, `mudarStatus(id, status) → Resultado`.

- [ ] **Step 1: e2e** `tests/e2e/tarefas.spec.ts`: `gerente cria tarefa para vendedora e ela aparece na coluna dela`; `tarefa vencida aparece como atrasada`; `vendedora só pode criar tarefa para si`; `esconder feitas`.
- [ ] **Step 2:** FAIL. **Step 3:** colunas = membros da loja (ordem: você primeiro, depois por nome), contador por coluna; filtros por query string `?semana=1&feitas=0` (padrão: todas abertas + feitas nos últimos 7 dias); realtime em `tarefas`. **Step 4:** PASS. **Step 5:** commit.

### Task 4: Página da tarefa, Cobrar, pedido de prazo e sino

**Files:** Create `src/app/(app)/tarefas/[id]/page.tsx`, `src/app/(app)/tarefas/[id]/not-found.tsx`, `src/components/tarefas/{mudar-status,cobrar,pedir-prazo,decidir-prazo}.tsx`, `src/app/(app)/avisos/page.tsx`, `src/app/(app)/sino.tsx`; Modify `src/app/(app)/layout.tsx`, `src/app/(app)/tarefas/actions.ts`.

**Interfaces (Produces):** `cobrar(id, mensagem)`, `pedirNovoPrazo(id, prazo, motivo)`, `decidirNovoPrazo(id, aprovar)` → `Resultado` (chamam as RPCs da Task 1).

- [ ] **Step 1: e2e**: `fluxo completo: gerente cobra, vendedora pede novo prazo, gerente aprova`; `vendedora não vê Cobrar`; `sino mostra aviso não lido e zera ao abrir`; `tarefa de outra loja responde 404`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar; histórico mostra "Prazo alterado N vezes". **Step 4:** PASS + suíte inteira + lint + build. **Step 5:** commit.
