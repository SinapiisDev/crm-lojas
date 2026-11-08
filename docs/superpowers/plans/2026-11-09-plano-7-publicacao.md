# Plano 7 — Pronto para publicar (Netlify + Supabase online)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O código roda nos limites dos planos grátis (Netlify: funções de ~10 s; Supabase: pausa por inatividade), tem CI em cada PR e um passo a passo de publicação que o usuário executa com as próprias contas.

**Architecture:** Rotinas com orçamento de tempo (param antes de 8 s e deixam o resto para a próxima chamada do cron); `/api/saude` toca o banco e é chamada 1x/dia por GitHub Actions para o Supabase não pausar; `netlify.toml`; workflow de CI com Supabase local no runner.

**Spec:** §10 (hospedagem grátis; Vercel Hobby proibido para uso comercial). **Decisão:** Netlify (Node completo: nodemailer/web-push funcionam), não Cloudflare (sem SMTP, CPU curta no grátis).

## Global Constraints

- Nenhuma execução de rota passa de ~8 s (`TEMPO_MAX_MS`, padrão 8000): despacho de avisos e rotina da IA param de iniciar trabalho novo depois do prazo; o que não foi feito continua na fila.
- Despacho reserva lotes de 10; avisos reservados e não enviados no prazo voltam para a fila.
- Rotina da IA chamada a cada 5 min entre 07:00 e 07:55 SP (`*/5 10 * * *`); cada chamada faz o que couber.
- `/api/saude`: pública, sem dados (só `{ ok, banco }`), faz uma leitura real no banco.
- CI: lint, tipos, testes de banco e e2e em cada PR e push na `main`.
- Nada de segredo no repositório; deploy só com as contas do usuário.

## Review Focus

- Rotina da IA com 50 leads parados e orçamento de 8 s → para no meio, próxima chamada continua de onde parou, ninguém analisado duas vezes no mesmo dia.
- Despacho estourando o tempo → avisos não enviados voltam para a fila (nenhum perdido).
- `/api/saude` com banco fora → `{ ok: false }` e 503, sem vazar erro interno.

---

### Task 1: Orçamento de tempo no despacho e na rotina da IA
**Files:** `src/lib/avisos/despachar.ts`, `src/lib/ia/semana.ts`, `src/app/api/ia/diaria/route.ts`, migration `20261109200000_publicacao.sql` (job `ia-diaria` → `*/5 10 * * *`), `tests/despacho.test.ts`, `tests/ia.test.ts`.
- [ ] Testes: despacho com prazo já vencido devolve o lote inteiro para a fila; rotina da IA com prazo curto analisa só parte e a segunda chamada continua sem repetir.

### Task 2: Saúde, Netlify e CI
**Files:** `src/app/api/saude/route.ts`, `src/proxy.ts`, `netlify.toml`, `.github/workflows/ci.yml`, `.github/workflows/manter-acordado.yml`, `README.md`, `tests/e2e/saude.spec.ts`.
- [ ] e2e: `/api/saude` sem login responde `{ ok: true, banco: true }`.
