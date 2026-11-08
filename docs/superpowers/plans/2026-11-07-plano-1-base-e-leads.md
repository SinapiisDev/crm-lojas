# Plano 1 — Base, login/convites e Kanban de Leads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema rodando localmente com login por convite, acesso por loja/cargo aplicado no banco e kanban de leads completo (etapas, contato, WhatsApp, vendido/perdido, lead parado).

**Architecture:** Next.js 16 App Router com Server Components e Server Actions; Supabase local (Docker) para Postgres + Auth + Realtime. Toda regra de acesso mora em políticas RLS; a UI só reflete. Regras puras de negócio em `src/lib/regras/*.ts` com testes Vitest.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript, Tailwind v4, shadcn/ui, @dnd-kit/core, @supabase/ssr, @supabase/supabase-js, Supabase CLI (`npx supabase`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-crm-lojas-design.md`

**Planos seguintes (fora deste):** 2 Tarefas + Cobrar · 3 Painel · 4 Notificações (push/e-mail/cron) · 5 Reuniões + Google Agenda · 6 Agente IA · 7 PWA + deploy.

## Global Constraints

- Next 16: middleware chama-se `src/proxy.ts` (export `proxy`); `cookies()` é async. Ler `node_modules/next/dist/docs/` antes de usar API nova.
- Toda tabela de negócio tem `empresa_id`.
- Cargos: `dono` (inclui sócio), `gerente`, `vendedor`, `conferente`. Cargo é por loja (`membros`).
- Vendedor vê só leads com `vendedor_id = auth.uid()`; dono/gerente veem todos da loja; conferente não vê leads.
- Sem auto-cadastro: usuário sem convite pendente é barrado no banco (vale para Google).
- Etapas: `novo, em_contato, orcamento_enviado, negociacao, vendido, perdido`.
- Origens: `instagram, loja_fisica, prospeccao, indicacao, outro`.
- Lead parado: etapa em (`orcamento_enviado`, `negociacao`) e `agora - ultimo_contato_em >= lojas.dias_lead_parado` dias (padrão 2).
- Vendido exige `valor_vendido > 0`; perdido exige `motivo_perda`.
- Registrar contato exige texto não vazio.
- Fuso `America/Sao_Paulo`. Interface em pt-BR. Cores neutras (marca decidida depois).

## Review Focus

- Vendedora tentando abrir `/leads/<id>` de colega pela URL → 404, não os dados.
- Login com Google de e-mail não convidado → volta ao login com mensagem "Acesso só por convite", sem criar usuário.
- Telefone digitado com máscara/espaços/sem DDI (`(11) 98888-7777`) → link `wa.me/5511988887777`.
- Arrastar card para Vendido e cancelar o diálogo → card volta para a coluna anterior, nada salvo.
- Gerente convidando alguém para loja onde não é gerente → recusado pelo banco.

---

### Task 1: Supabase local + schema + RLS

**Files:**
- Create: `supabase/` (via `npx supabase init`), `supabase/migrations/20261107000000_base.sql`, `supabase/seed.sql`
- Create: `tests/rls.test.ts`, `vitest.config.ts`, `.env.local`
- Modify: `package.json` (scripts `db:start`, `db:reset`, `test`)

**Interfaces:**
- Produces tabelas: `empresas(id, nome)`, `lojas(id, empresa_id, nome, whatsapp, dias_lead_parado int default 2)`, `perfis(id → auth.users, nome, email)`, `membros(usuario_id, loja_id, cargo, pk(usuario_id, loja_id))`, `convites(id, email, loja_id, cargo, criado_por, aceito_em, criado_em)`, `leads(id, empresa_id, loja_id, vendedor_id, nome, telefone, origem, etapa, valor_estimado, valor_vendido, motivo_perda, ultimo_contato_em, temperatura, criado_em)`, `lead_eventos(id, lead_id, autor_id, tipo, texto, criado_em)` com `tipo in ('contato','whatsapp','etapa','criado')`.
- Produces funções SQL: `meu_cargo(loja uuid) returns cargo`, `ve_todos_leads(loja uuid) returns boolean`.
- Trigger `auth.users after insert`: sem convite pendente para o e-mail → `raise exception 'convite_obrigatorio'`; com convite → cria `perfis`, `membros` para cada convite pendente e marca `aceito_em`.
- Leads: `empresa_id` preenchido por trigger a partir da loja; publicação realtime em `leads`.

- [ ] **Step 1:** `npm i -D supabase vitest` ; `npx supabase init` ; `npx supabase start` → anota URL, anon key, service key em `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] **Step 2: teste RLS falhando** — `tests/rls.test.ts` (cria usuários via admin API após inserir convites com service role):
  - `vendedora vê só os próprios leads` — A e B vendedoras da loja 1, cada uma com 1 lead → A lista 1 lead (o dela).
  - `gerente vê todos os leads da loja e nenhum da outra`.
  - `conferente não vê leads`.
  - `dono de duas lojas vê leads das duas`.
  - `cadastro sem convite falha` — `auth.admin.createUser` com e-mail sem convite → erro.
  - `gerente não convida para loja alheia` — insert em `convites` com loja 2 → erro RLS.
  - `vendido sem valor é recusado` — update etapa=`vendido` sem valor → erro de check.
- [ ] **Step 3:** `npx vitest run tests/rls.test.ts` → FAIL (tabelas não existem).
- [ ] **Step 4:** escrever a migration (tabelas, enums, checks `etapa<>'vendido' or valor_vendido>0`, `etapa<>'perdido' or motivo_perda is not null`, funções `security definer` com `set search_path = public`, RLS em todas as tabelas, trigger de convite). `seed.sql`: empresa + "Loja 1" + "Loja 2".
- [ ] **Step 5:** `npx supabase db reset && npx vitest run tests/rls.test.ts` → PASS.
- [ ] **Step 6:** commit `feat(db): schema base, RLS por loja/cargo e convite obrigatório`.

### Task 2: Regras puras de leads

**Files:** Create `src/lib/regras/leads.ts`, `src/lib/regras/leads.test.ts`

**Interfaces (Produces):**
- `type Etapa = 'novo'|'em_contato'|'orcamento_enviado'|'negociacao'|'vendido'|'perdido'`; `ETAPAS: {id: Etapa, titulo: string}[]` (títulos: Novo, Em contato, Orçamento enviado, Negociação, Vendido, Perdido).
- `leadParado(lead: {etapa: Etapa; ultimo_contato_em: string}, diasLimite: number, agora?: Date): boolean`
- `diasSemContato(ultimo: string, agora?: Date): number`
- `linkWhatsApp(telefone: string, texto?: string): string | null`
- `validarMudancaEtapa(destino: Etapa, extras: {valorVendido?: number; motivoPerda?: string}): string | null` (mensagem de erro pt-BR ou null)

- [ ] **Step 1: testes**
  - `leadParado` true para negociacao com contato há 2 dias e limite 2; false com 1 dia; false para `novo` há 10 dias; false para `vendido`.
  - `linkWhatsApp('(11) 98888-7777','Oi')` → `https://wa.me/5511988887777?text=Oi`; `'+55 11 98888-7777'` → mesmo número; `'123'` → `null`.
  - `validarMudancaEtapa('vendido',{})` → `'Informe o valor vendido'`; `('vendido',{valorVendido:1500})` → null; `('perdido',{motivoPerda:' '})` → `'Informe o motivo da perda'`; `('negociacao',{})` → null.
- [ ] **Step 2:** `npx vitest run src/lib/regras` → FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5:** commit `feat(leads): regras de etapa, lead parado e link WhatsApp`.

### Task 3: Supabase no Next + proxy de sessão + login/convite

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`, `src/proxy.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/app/auth/confirmar/route.ts`, `src/app/definir-senha/page.tsx`
- Modify: `supabase/config.toml` (`site_url`, `additional_redirect_urls`, Google provider com `env(GOOGLE_CLIENT_ID)` desligado até ter credencial)

**Interfaces (Produces):**
- `criarClienteServidor(): Promise<SupabaseClient>` (cookies), `criarClienteNavegador(): SupabaseClient`, `criarClienteAdmin(): SupabaseClient` (service role, só servidor).
- `entrar(formData): Promise<{erro?: string}>`, `entrarComGoogle(): Promise<never>`, `esqueciSenha(formData): Promise<{ok?: true; erro?: string}>`, `definirSenha(formData)`.
- Proxy: rotas públicas `/login`, `/auth/*`, `/definir-senha`; resto sem sessão → `/login`.

- [ ] **Step 1:** `npm i @supabase/ssr @supabase/supabase-js` e ler o README de `@supabase/ssr` instalado para a assinatura de cookies atual.
- [ ] **Step 2:** implementar clientes + `proxy.ts` (renova sessão; matcher exclui `_next/static`, `_next/image`, imagens).
- [ ] **Step 3:** página de login: tela dividida (lado esquerdo escuro com "Nome da empresa" + frase; cartão à direita; no celular só cartão), e-mail, senha, "Manter conectado" (marcado), "Esqueci a senha", botão "Entrar com Google". Erro `convite_obrigatorio`/"Database error saving new user" → "Acesso só por convite. Fale com a gerente da sua loja."
- [ ] **Step 4:** `/auth/confirmar` usa `verifyOtp({type, token_hash})` (convite/recuperação) → `/definir-senha`; `/auth/callback` troca `code` por sessão.
- [ ] **Step 5: verificação manual** — `npm run dev`; criar dono via script (Task 4) ; e-mail chega no Mailpit (`http://127.0.0.1:54324`); definir senha; entrar; sair; acessar `/leads` deslogado redireciona para `/login`.
- [ ] **Step 6:** commit `feat(auth): login e-mail/senha, Google, convite e recuperação`.

### Task 4: Shell do app, seletor de loja, equipe/convites

**Files:**
- Create: `scripts/criar-dono.ts` (`npm run criar-dono -- email "Nome"`: convites `dono` nas 2 lojas + `inviteUserByEmail`)
- Create: `src/lib/sessao.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/equipe/page.tsx`, `src/app/(app)/equipe/actions.ts`, `src/app/page.tsx` (redirect `/leads`)
- shadcn: `npx shadcn@latest init` + `button input label dialog select textarea badge card dropdown-menu sonner`

**Interfaces (Produces):**
- `obterSessao(): Promise<{usuario: {id, nome, email}; lojas: {id, nome, cargo}[]; lojaAtual: {id, nome, cargo}}>` — loja atual via cookie `loja`, padrão primeira; redireciona `/login` se sem sessão.
- `trocarLoja(lojaId: string)` (server action, grava cookie).
- `convidar(formData: {email, cargo, nome})` — só dono/gerente; insere convite (RLS valida) e chama `inviteUserByEmail`; gerente não pode convidar `dono`.

- [ ] **Step 1:** layout com cabeçalho: nome do sistema, seletor de loja (só se >1), menu Leads / Equipe, usuário + Sair. Mobile: menu inferior.
- [ ] **Step 2:** `/equipe`: lista membros da loja atual com cargo; formulário Convidar (dono/gerente); convites pendentes.
- [ ] **Step 3: verificação manual** — dono convida vendedora; vendedora entra e não vê "Convidar".
- [ ] **Step 4:** commit `feat(app): shell, seletor de loja e convites da equipe`.

### Task 5: Kanban de leads

**Files:**
- Create: `src/app/(app)/leads/page.tsx`, `src/app/(app)/leads/actions.ts`, `src/components/leads/quadro.tsx` (client, dnd-kit), `src/components/leads/card-lead.tsx`, `src/components/leads/dialogo-etapa.tsx`, `src/components/leads/novo-lead.tsx`, `src/components/leads/ao-vivo.tsx` (realtime → `router.refresh()`)
- Create: `src/app/(app)/leads/[id]/page.tsx`, `src/components/leads/registrar-contato.tsx`

**Interfaces:**
- Consumes: `ETAPAS`, `leadParado`, `diasSemContato`, `linkWhatsApp`, `validarMudancaEtapa` (Task 2); `obterSessao` (Task 4).
- Produces actions: `criarLead(formData)`, `moverLead(id: string, etapa: Etapa, extras)`, `registrarContato(id: string, texto: string)`, `registrarWhatsApp(id: string)` → retornam `{erro?: string}`; cada uma grava `lead_eventos` e, para contato/whatsapp, `ultimo_contato_em = now()`.

- [ ] **Step 1:** página lista leads da loja atual (RLS filtra) + `dias_lead_parado` da loja; 6 colunas na ordem de `ETAPAS`, contador por coluna, scroll horizontal no celular.
- [ ] **Step 2:** card: nome, origem, valor estimado (R$), "há N dias sem contato", vendedora (só para dono/gerente), borda vermelha + selo "Parado" quando `leadParado`.
- [ ] **Step 3:** arrastar entre colunas → `moverLead`; destino Vendido/Perdido abre `dialogo-etapa` (valor / motivo: Preço, Sumiu, Comprou no concorrente, Outro + texto); cancelar devolve o card. Erro do servidor → toast e card volta.
- [ ] **Step 4:** "Novo lead": nome, telefone, origem, valor estimado, vendedora (dono/gerente escolhem; vendedora = ela mesma). Etapa `novo`, `ultimo_contato_em = now()`.
- [ ] **Step 5:** `/leads/[id]`: dados, histórico de eventos, "Registrar contato" (texto obrigatório), botão WhatsApp (chama `registrarWhatsApp` e abre `linkWhatsApp(telefone)`), lead inexistente/invisível → `notFound()`.
- [ ] **Step 6:** realtime: canal `leads` com `router.refresh()`.
- [ ] **Step 7: verificação** — `npm run build` sem erro; `npx vitest run` passa; manual com 2 navegadores (dono e vendedora): vendedora move card, dono vê atualizar sozinho; vendedora acessa `/leads/<id da colega>` → 404.
- [ ] **Step 8:** commit `feat(leads): kanban com etapas, contato, WhatsApp e lead parado`.
