# Plano 4 — Notificações fora do app (push, e-mail, rotina diária) e app instalável

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo aviso criado em `notificacoes` chega ao celular (push) ou, sem push ativado, por e-mail; uma rotina diária cria os avisos de lead parado, tarefa na véspera e tarefa atrasada; o CRM vira PWA instalável (necessário para push no iPhone).

**Architecture:** Caixa de saída: `notificacoes.enviado_em` nulo = pendente. `reservar_avisos()` marca um lote atomicamente (`for update skip locked`) e `despacharAvisos()` (TypeScript, chave secreta) envia por Web Push (`web-push`) ou e-mail (`nodemailer`, SMTP). O despacho roda logo depois das ações do app (`after()` do Next) e, como rede de segurança, a cada minuto via `pg_cron` + `pg_net` chamando `POST /api/avisos/despachar` com segredo. A rotina diária é SQL (`rotina_diaria()`) agendada no `pg_cron` às 8h de São Paulo, com chave de deduplicação por aviso.

**Tech Stack:** + `web-push`, `nodemailer`; Supabase `pg_cron`, `pg_net`, Vault; Mailpit local (SMTP 54325).

**Spec:** §5 (lembrete na véspera, aviso de atraso para responsável + gerente), §4 (lead parado), §8 (o quando é regra fixa), §10 (push VAPID, PWA, Resend/SMTP).

## Global Constraints

- Push só para quem ativou neste aparelho; sem nenhuma inscrição de push → e-mail para `perfis.email`. (Não manda os dois.)
- Rotina diária às 08:00 America/Sao_Paulo (`0 11 * * *` UTC):
  - **Lead parado** (regra `dias_lead_parado` da loja) → vendedora, no máximo 1 por lead por dia. Texto: `Sem contato há N dias. Entre em contato de novo.`; link `/leads/<id>`.
  - **Véspera**: tarefa aberta com prazo amanhã → responsável, 1 por tarefa e prazo. Título `Tarefa vence amanhã`.
  - **Atraso**: tarefa aberta com prazo < hoje → responsável **e** donos/gerentes da loja, 1 por pessoa, tarefa e prazo. Título `Tarefa atrasada`.
- Só avisos das últimas 24 h são despachados (nada de mandar backlog antigo).
- Inscrição de push 404/410 é apagada.
- `/api/avisos/despachar` exige `Authorization: Bearer <AVISOS_SEGREDO>`; comparação em tempo constante.
- Segredos fora do git: VAPID e SMTP em `.env.local`; URL/segredo do despacho no Vault (seed só com valores locais).
- PWA: `manifest.webmanifest`, ícones 192/512 gerados, `sw.js` sem cache; rotas públicas no proxy.
- No iPhone o botão explica "Adicione à Tela de Início" quando não instalado.

## Review Focus

- Dois despachos simultâneos (cron + `after()`) → cada aviso sai uma vez só.
- Rotina rodando duas vezes no mesmo dia → nenhum aviso duplicado.
- Pessoa com push e e-mail → só push; push expirado (410) → inscrição removida e o aviso não se perde em silêncio (cai no e-mail se não sobrar inscrição).
- Chamada ao despacho sem segredo ou com segredo errado → 401, nada enviado.
- Usuário lendo/apagando inscrição de push de outra pessoa → recusado.

---

### Task 1: Banco — inscrições, caixa de saída, rotina diária e agendamento
**Files:** `supabase/migrations/20261108300000_notificacoes_externas.sql`, `supabase/seed.sql` (segredos locais no Vault), `supabase/config.toml` (SMTP Mailpit 54325), `tests/avisos.test.ts`.
**Produces:** `push_inscricoes(id, usuario_id, endpoint unique, p256dh, auth, criado_em)` (RLS: só a própria); `notificacoes.enviado_em`, `notificacoes.chave unique`; `avisar_uma_vez(usuario, loja, titulo, texto, link, chave)`; `rotina_diaria() returns int` (só service_role); `reservar_avisos(p_limite int) returns setof notificacoes` (só service_role); jobs `rotina-diaria` e `despachar-avisos`.
- [ ] Testes: `rotina cria aviso de lead parado para a vendedora`; `véspera avisa o responsável`; `atraso avisa responsável e gerência`; `rodar a rotina duas vezes não duplica`; `reservar_avisos entrega cada aviso uma vez mesmo em chamadas paralelas`; `ninguém vê inscrição de push alheia`; `cliente não chama rotina_diaria nem reservar_avisos`.
- [ ] FAIL → migration → PASS → commit.

### Task 2: Despacho (push + e-mail) e rota
**Files:** `src/lib/avisos/despachar.ts`, `src/lib/avisos/email.ts`, `src/app/api/avisos/despachar/route.ts`, `src/proxy.ts` (rotas públicas), `src/app/(app)/tarefas/actions.ts` (`after(despacharAvisos)`), `vitest.config.mts` (alias `server-only`), `tests/despacho.test.ts`.
**Produces:** `despacharAvisos(): Promise<{ push: number; email: number }>`.
- [ ] Testes (servidor de push falso local + Mailpit): `sem inscrição vai por e-mail`; `com inscrição vai por push e não por e-mail`; `push 410 apaga inscrição e cai no e-mail`; `segundo despacho não reenvia`; `rota sem segredo responde 401`.
- [ ] FAIL → implementar → PASS → commit.

### Task 3: PWA e ativação no aparelho
**Files:** `src/app/manifest.ts`, `src/app/icones/[tamanho]/route.tsx`, `public/sw.js`, `src/components/comum/ativar-notificacoes.tsx`, `src/app/(app)/avisos/actions.ts` (`salvarInscricao`, `removerInscricao`), `src/app/(app)/avisos/page.tsx`, `next.config.ts` (headers do `sw.js`), `tests/e2e/pwa.spec.ts`.
- [ ] e2e: `manifest válido com ícones`; `sw.js servido sem cache`; `ícone 192 é PNG`; `página de avisos mostra o botão de ativar`.
- [ ] FAIL → implementar → PASS + suíte inteira + lint + build → commit.
