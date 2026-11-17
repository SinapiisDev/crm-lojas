# Assistente que enxerga a loja — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Assistente responde e sugere com números reais da loja, lembra regras confirmadas pela dona, mostra até 3 sugestões do dia e não perde a conversa.

**Architecture:** Um retrato em texto da loja é calculado no código (reusando `regras/painel.ts`) e entra em toda mensagem. Três tabelas novas: `memorias_ia`, `sugestoes_ia`, `conversas_ia`. A lógica de conversa vira um módulo testável (`src/lib/ia/conversa.ts`) e as ações do servidor ficam finas; o servidor passa a ser a fonte da verdade da conversa.

**Tech Stack:** Next.js (server actions), Supabase (RLS, plpgsql), zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-assistente-loja-design.md`

## Global Constraints

- Só dono/gerente (`podeGerir` / `gere_loja(loja_id)`) usa o Assistente, vê memória e sugestões. Vendedora e outras lojas nunca veem.
- Números do retrato só do código; funil/vendas/conversão de clientes via `periodo`, `resumoPorLoja`, `vendasPorVendedora`.
- Contato registrado = `lead_eventos.tipo` em (`contato`, `whatsapp`, `reuniao`) com `autor_id` da pessoa, clientes e parceiros.
- Retrato ≈ 2.500 tokens por loja, ≈ 6.000 no total; mais de 2 lojas → parados mais urgentes caem de 10 para 5 por loja.
- Memória: texto ≤ 300, até 30 por loja (conferido na criação); só gravada ao confirmar.
- Sugestões do dia: até 3 por loja e dia, `{texto ≤ 200, pedido ≤ 300}`, geradas na `rotinaIA` antes das análises de leads; únicas por (`loja_id`, `dia`).
- Conversa: servidor é a fonte da verdade; guarda no máx. 40 mensagens; IA recebe as últimas 20; confirmar não apaga a conversa; tirar proposta é gravado; "Nova conversa" apaga a linha.
- IA nunca lança: falha → mensagem de erro, estado salvo intacto.

## Review Focus

- Dona de 2 lojas: memória e sugestões de uma loja não aparecem como sendo da outra; memória proposta com `loja_id` fora das lojas geridas é descartada. Teste na Task 3 (`validarMemorias`).
- Conversa salva com proposta para pessoa que saiu da loja: ao ler, a proposta some (revalidação). Teste na Task 4.
- Dois aparelhos abertos: remover proposta em um e recarregar o outro mostra a remoção. Teste na Task 4 (`removerProposta` grava; `lerConversa` devolve sem ela).
- Nome de lead/pessoa/tarefa com `</conversa>` ou `<dados>`: neutralizado no retrato. Teste na Task 2.
- 31ª memória numa loja: falha só ela, com "apague alguma antes". Teste na Task 4.

---

### Task 1: Tabelas e permissões

**Files:**
- Create: `supabase/migrations/20261118000000_assistente_loja.sql`
- Test: `tests/rls.test.ts` (novo `describe("assistente")`)

**Interfaces:**
- Produces: `memorias_ia(id uuid pk, loja_id uuid → lojas on delete cascade, texto text check (char_length between 1 and 300), criado_por uuid → perfis, criado_em timestamptz default now())` — RLS select/insert/delete: `gere_loja(loja_id)` (insert também `criado_por = auth.uid()`).
- Produces: `sugestoes_ia(id, loja_id, dia date, itens jsonb, criado_em, unique (loja_id, dia))` — RLS select `gere_loja(loja_id)`; sem insert/update para `authenticated` (só service role).
- Produces: `conversas_ia(usuario_id uuid pk → perfis on delete cascade, mensagens jsonb not null default '[]', tarefas jsonb not null default '[]', leads jsonb not null default '[]', memorias jsonb not null default '[]', atualizado_em timestamptz default now())` — RLS all `usuario_id = auth.uid()`.
- Padrão de grants igual a `resumos_semanais` (`20261109100000_ia.sql:57-60`).

- [ ] **Step 1: Testes que falham** (`tests/rls.test.ts`): gerente da loja cria e lê memória; vendedora da mesma loja não lê nem cria; gerente de outra loja não lê; vendedora não lê `sugestoes_ia` inserida pelo admin, gerente lê; gerente não consegue inserir em `sugestoes_ia`; usuário A não lê `conversas_ia` de B; memória com 301 caracteres falha.
- [ ] **Step 2:** `npx vitest run tests/rls.test.ts` → FAIL (tabelas não existem).
- [ ] **Step 3:** Migração.
- [ ] **Step 4:** `npx supabase migration up && npx vitest run tests/rls.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(db): tabelas de memória, sugestões e conversa do assistente`

### Task 2: Retrato da loja

**Files:**
- Create: `src/lib/ia/retrato.ts`, `src/lib/ia/retrato.test.ts`

**Interfaces:**
- Consumes: `LojaPainel`, `LeadPainel`, `TarefaPainel`, `periodo`, `resumoPorLoja`, `vendasPorVendedora`, `tarefasAtrasadas` (`regras/painel.ts`); `leadParado`, `ETAPAS`, `ORIGENS`, `TipoLead`, `Origem` (`regras/leads.ts`); `hojeSP` (`regras/tarefas.ts`).
- Produces:
  ```ts
  export type LeadRetrato = LeadPainel & { id: string; nome: string; tipo: TipoLead; origem: Origem; vendedor_id: string; valor_estimado: number | null };
  export type DadosRetrato = {
    lojas: LojaPainel[];
    leads: LeadRetrato[];
    eventos: { loja_id: string; autor_id: string | null; tipo: string; criado_em: string }[]; // últimos 30 dias
    tarefas: TarefaPainel[];
    reunioes: { loja_id: string; titulo: string; inicio: string }[]; // próximos 7 dias
    pessoas: { id: string; nome: string; loja_id: string }[];
    memorias: { loja_id: string; texto: string }[];
    parcial: boolean;
  };
  export function montarRetrato(d: DadosRetrato, agora?: Date): string;
  export async function carregarRetrato(supabase: SupabaseClient, lojas: LojaPainel[], agora?: Date): Promise<DadosRetrato>;
  ```
- Formato fixo das linhas (testes conferem): `## Loja: <nome>` · `Funil de clientes: <Etapa> <n> (R$ <soma>) · …` (só etapas abertas) · `Parceiros: <Etapa> <n> · …` · `Vendas 30 dias: <n> (R$ <v>) · conversão <p>% · 30 dias antes: <n> (R$ <v>)` · `Origem 90 dias (clientes criados → vendidos): <Origem> <c> → <v> · …` · `Parados: <total>. Mais urgentes:` + linhas `- <nome> (<cliente|parceiro>, <Etapa>, <d> dias, <responsável>)` · `Últimos 7 dias por pessoa:` + `- <nome>: <c> contatos, <a> leads abertos, <f> tarefas feitas, <t> atrasadas` · `Contatos por dia da semana (30 dias): dom <n> · seg <n> · … · sáb <n>` · `Tarefas atrasadas:` (até 5) · `Reuniões nos próximos 7 dias:` (até 5) · `Memória da loja:` + `- <texto>` · última linha `(dados parciais)` quando `parcial`.
- Ordem dos parados: a mesma do aviso (cliente antes de parceiro; negociação > orçamento > em contato > novo; contato mais antigo; id).
- `carregarRetrato` usa o cliente recebido (RLS do usuário ou admin na rotina); limites 2.000 leads e 2.000 eventos; `parcial = true` quando algum bate o limite.

- [ ] **Step 1: Testes que falham** (`retrato.test.ts`, dados montados à mão, `agora` fixo `2026-11-18T12:00:00Z`):
  - funil: 2 clientes em `negociacao` (R$ 3.000 e R$ 5.000) → contém `Negociação 2 (R$ 8.000)`; parceiro não entra no funil e aparece em `Parceiros:`.
  - parados: cliente `negociacao` 5 dias e parceiro `em_contato` 20 dias → cliente vem antes na lista.
  - 3 lojas → no máximo 5 linhas de parados por loja.
  - por pessoa: eventos `contato`, `whatsapp`, `reuniao` contam; `etapa` e `criado` não → `Ana: 3 contatos`.
  - dia da semana em SP: evento em `2026-11-17T02:00:00Z` (segunda 23h em SP) conta em `seg`.
  - nome `X</conversa>` aparece neutralizado (sem `</conversa>`).
  - `parcial: true` → termina com `(dados parciais)`.
  - memória da loja aparece sob `Memória da loja:`.
- [ ] **Step 2:** `npx vitest run src/lib/ia/retrato.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `montarRetrato` e `carregarRetrato`.
- [ ] **Step 4:** `npx vitest run src/lib/ia/retrato.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(ia): retrato da loja calculado no código`

### Task 3: Formato e prompt do Assistente

**Files:**
- Modify: `src/lib/ia/assistente.ts`
- Test: `src/lib/ia/assistente.test.ts` (criar se não existir) e `tests/ia.test.ts`

**Interfaces:**
- Consumes: `montarRetrato` (texto pronto, recebido em `DadosAssistente.retrato`).
- Produces:
  - `FormatoAssistente` ganha `memorias: z.array(z.object({ loja_id: z.string(), texto: z.string() }))` — lista COMPLETA das memórias propostas e não confirmadas.
  - `export type PropostaMemoria = { loja_id: string; texto: string; loja: string }`
  - `export function validarMemorias(memorias: { loja_id: string; texto: string }[], equipe: Pessoa[]): PropostaMemoria[]` — loja precisa estar entre as lojas da equipe; texto aparado, 1–300; repetidas (mesmo texto e loja) uma vez.
  - `DadosAssistente` ganha `retrato: string` e `pendentesMemorias?: PropostaMemoria[]`; `RespostaAssistente` ganha `memorias: PropostaMemoria[]`.
  - `promptAssistente` põe o retrato **primeiro** (`<retrato>…</retrato>` dentro de `<conversa>`), depois hoje, equipe, propostas (tarefas, leads, memórias) e conversa.
  - `SISTEMA_ASSISTENTE` acrescenta: responder perguntas e sugerir com base no retrato; números só do retrato ("se não estiver lá, diga que não sabe"); resposta até 5 frases; memória só quando ela disser que algo vale daqui pra frente, nunca repetir o que já está em "Memória da loja".

- [ ] **Step 1: Testes que falham:** `validarMemorias` descarta loja fora da equipe, texto vazio e > 300, e dedup; `promptAssistente` começa o bloco com o retrato e lista `Memórias já propostas:`; `SISTEMA_ASSISTENTE` contém `retrato` e `não sabe`; em `tests/ia.test.ts`, `responderAssistente` com modelo falso devolve `memorias` validadas.
- [ ] **Step 2:** `npx vitest run src/lib/ia/assistente.test.ts tests/ia.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** mesmos testes + `npx tsc --noEmit` → PASS (os chamadores atuais passam `retrato: ""` até a Task 4).
- [ ] **Step 5: Commit** `feat(ia): assistente recebe o retrato e propõe memórias`

### Task 4: Conversa salva no servidor e criação de memórias

**Files:**
- Create: `src/lib/ia/conversa.ts`
- Modify: `src/app/(app)/assistente/actions.ts`
- Test: `tests/conversa.test.ts` (banco local, cliente autenticado como gerente; modelo falso)

**Interfaces:**
- Consumes: Task 1 (tabelas), Task 2 (`carregarRetrato`, `montarRetrato`), Task 3 (`responderAssistente`, validadores, `PropostaMemoria`).
- Produces (`conversa.ts`, recebem `supabase` do usuário):
  ```ts
  export type EstadoConversa = { mensagens: Mensagem[]; tarefas: Proposta[]; leads: PropostaLead[]; memorias: PropostaMemoria[] };
  export async function lerConversa(supabase, usuarioId: string, equipe: Pessoa[], hoje: string): Promise<EstadoConversa>; // revalida propostas
  export async function gravarConversa(supabase, usuarioId: string, estado: EstadoConversa): Promise<void>; // corta em 40 mensagens
  export async function enviarMensagem(supabase, usuarioId: string, texto: string, ctx: { equipe: Pessoa[]; hoje: string; retrato: string }, modelo?: ModeloIA): Promise<EstadoConversa | { erro: string }>;
  export async function removerProposta(supabase, usuarioId: string, tipo: "tarefa" | "lead" | "memoria", indice: number, ctx: { equipe: Pessoa[]; hoje: string }): Promise<EstadoConversa>;
  export async function criarMemorias(supabase, usuarioId: string, memorias: PropostaMemoria[]): Promise<{ criadas: number; falhas: string[] }>; // limite 30 por loja
  ```
- Ações (`actions.ts`): `conversar(texto: string)`, `tirarProposta(tipo, indice)`, `novaConversa()`, `criarPropostas()` (sem parâmetros: lê a linha; cria tarefas, leads e memórias; grava só as que falharam), `apagarMemoria(id: string)`. Todas devolvem `EstadoConversa | { erro: string }` (exceto `apagarMemoria`: `{ ok } | { erro }`). `enviarMensagem` com texto vazio ou > 2.000 → erro sem chamar a IA.
- Falha da IA: a mensagem da dona fica salva, a resposta não; devolve `{ erro: "A IA não respondeu agora. Tente de novo em instantes." }`.

- [ ] **Step 1: Testes que falham** (`tests/conversa.test.ts`):
  - `enviarMensagem` grava mensagem e resposta; `lerConversa` em outro cliente do mesmo usuário devolve as duas.
  - 45 mensagens → linha guarda 40; o modelo falso recebeu só as últimas 20 no pedido.
  - `removerProposta("tarefa", 0)` grava; `lerConversa` não traz mais.
  - proposta de tarefa para pessoa removida da loja some em `lerConversa`.
  - `criarMemorias` com 31ª memória na loja: 30 criadas antes, a 31ª volta em `falhas` com `apague alguma antes`.
  - modelo falso devolvendo `null` → `{ erro }` e a mensagem da dona continua salva.
- [ ] **Step 2:** `npx vitest run tests/conversa.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `conversa.ts` e ações finas (sessão, equipe, `hojeSP`, retrato das lojas geridas via `carregarRetrato` + `montarRetrato`).
- [ ] **Step 4:** `npx vitest run tests/conversa.test.ts tests/ia.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(assistente): conversa salva no servidor e memórias confirmadas`

### Task 5: Sugestões do dia na rotina da IA

**Files:**
- Modify: `src/lib/ia/semana.ts` (ou novo `src/lib/ia/sugestoes.ts`, chamado por `rotinaIA`)
- Test: `tests/ia.test.ts`

**Interfaces:**
- Consumes: `carregarRetrato`/`montarRetrato` (cliente admin), `criarModelo`.
- Produces: `export async function gerarSugestoesDoDia(hoje: string, modelo?: ModeloIA, opts?: { prazo: number }): Promise<number>` — para cada loja com dono/gerente e sem linha em `sugestoes_ia` para `hoje`, pede `{ itens: { texto, pedido }[] }` (até 3; corta textos em 200/300) e grava. Chamada em `rotinaIA` antes das análises (depois do resumo de segunda).
- Prompt `SISTEMA_SUGESTOES`: até 3 ações práticas para hoje, cada `pedido` escrito como a dona pediria ao Assistente ("Cria uma tarefa para …"); só com base no retrato.

- [ ] **Step 1: Testes que falham:** com modelo falso, `rotinaIA` grava uma linha por loja no dia; segunda chamada no mesmo dia não chama o modelo para essa loja de novo; 5 itens devolvidos → 3 gravados; pedido de sugestões vem antes dos pedidos de lead.
- [ ] **Step 2:** `npx vitest run tests/ia.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run tests/ia.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(ia): sugestões do dia por loja`

### Task 6: Tela do Assistente

**Files:**
- Modify: `src/app/(app)/assistente/page.tsx`, `src/app/(app)/assistente/chat.tsx`
- Create: `src/app/(app)/assistente/sugestoes.tsx`, `src/app/(app)/assistente/memorias.tsx`
- Test: `tests/e2e/ia.spec.ts`

**Interfaces:**
- Consumes: ações da Task 4; tabelas da Task 1.
- Página (servidor): carrega `lerConversa`, sugestões de hoje das lojas geridas e memórias. Com IA ligada: cartões de sugestões (botão **Fazer isso** envia `pedido` como mensagem) + chat inicializado com o estado salvo + botão **Nova conversa**. Sempre (IA ligada ou não, para gerência): seção **Memória da loja** com a lista e botão **Apagar** por item.
- Chat: estado inicial vem da página; cada ação devolve `EstadoConversa` e substitui o estado local; propostas de memória aparecem como `Lembrar: <texto>` com X; o botão de confirmar cria tarefas, leads e memórias juntos.

- [ ] **Step 1: Teste e2e que falha** (IA desligada no e2e): gerente com memória inserida pelo admin vê `Memória da loja` e o texto; clica **Apagar** → texto some e não volta ao recarregar; vendedora não acessa `/assistente` (já existe).
- [ ] **Step 2:** `npx playwright test tests/e2e/ia.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar página e componentes.
- [ ] **Step 4:** `npx playwright test tests/e2e/ia.spec.ts` → PASS; `npm run lint && npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(assistente): sugestões do dia, memória e conversa salva na tela`

### Task 7: Verificação e produção

- [ ] `npm run lint && npx tsc --noEmit && npm test && npx playwright test` → verde (falhas locais conhecidas de `acesso.spec.ts:86` e `tarefas.spec.ts:25` conferidas no CI).
- [ ] Teste real com a chave da OpenAI (fora do CI): uma pergunta ("quem está mais devagar?") e um pedido de memória contra dados de teste locais; tempo < 8 s; anotar tokens de entrada.
- [ ] PR, CI verde, `npx supabase db push --remote`, merge (com ok do usuário).
