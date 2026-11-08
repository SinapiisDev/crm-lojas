# Plano 5 — Reuniões, convite de calendário e ata

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dona/gerente marcam reuniões com participantes da loja; cada participante recebe convite de calendário por e-mail (entra sozinho no Google Agenda/Outlook/iPhone) e aviso no app; lembrete 1 h antes; depois alguém registra se aconteceu e a ata; o painel mostra reuniões com/sem registro.

**Architecture:** Tabelas `reunioes` + `reuniao_participantes` com RLS (mesmo padrão de tarefas). Convite de calendário = e-mail com iCalendar (`METHOD:REQUEST`/`CANCEL`, `UID` fixo, `SEQUENCE` crescente) gerado por função pura `gerarIcs`, enviado com `after()` na ação. Feed por pessoa em `/agenda/<token>.ics` (token secreto em `perfis`). Lembrete por `pg_cron` a cada 5 min (`lembrar_reunioes()`), usando a caixa de saída do Plano 4.

**Spec:** §5 (reuniões), §6 item 4 (bloco Reuniões no painel). **Mudança decidida em conversa:** em vez da API do Google Agenda (exige OAuth por pessoa), convite iCalendar por e-mail + feed `.ics`.

## Global Constraints

- Criar, remarcar e cancelar: só `dono`/`gerente` da loja. Participantes: só membros da loja (o criador entra automaticamente).
- Todos da loja veem as reuniões da loja.
- Registrar "aconteceu" (sim/não) + ata: participante ou gestor; ata obrigatória quando aconteceu = sim.
- "Sem registro": terminou (`inicio + duracao`) há mais de 24 h e não foi registrada.
- Lembrete: 1 vez por participante, entre 65 e 0 minutos antes do início. Título `Reunião em 1 hora`.
- Horários gravados em UTC (`timestamptz`); exibidos e digitados em America/Sao_Paulo.
- ICS: CRLF, linhas dobradas em 75 octetos, texto escapado (`\\`, `;`, `,`, quebra de linha), `DTSTART`/`DTEND` em UTC (`...Z`), `UID` = `<id>@crm-lojas`.
- Feed: token aleatório por pessoa, rota pública só com token válido (senão 404); só reuniões em que a pessoa participa, dos últimos 30 dias em diante.
- Funções novas sem EXECUTE para anon; nenhuma `security definer` confia em `auth.uid()` nulo.

## Review Focus

- Vendedora criando reunião ou incluindo pessoa de outra loja por API → recusado.
- Remarcar reunião → convite novo com `SEQUENCE` maior (agenda atualiza, não duplica).
- Token de feed errado ou de pessoa que saiu da loja → 404 / sem reuniões da loja.
- Título com vírgula, ponto e vírgula, acento e quebra de linha → ICS válido.
- Lembrete rodando várias vezes → um aviso por pessoa.

---

### Task 1: Banco — reuniões, participantes, ata, lembrete e token de agenda
**Files:** `supabase/migrations/20261109000000_reunioes.sql`, `tests/reunioes.test.ts`.
**Produces:** `reunioes(id, empresa_id, loja_id, titulo, pauta, inicio, duracao_min, local, criado_por, sequencia, cancelada, aconteceu, ata, registrada_por, registrada_em, criado_em)`; `reuniao_participantes(reuniao_id, usuario_id)`; `perfis.agenda_token`; RPCs `criar_reuniao(p_loja, p_titulo, p_pauta, p_inicio, p_duracao, p_local, p_participantes uuid[]) returns uuid`, `registrar_reuniao(p_reuniao, p_aconteceu, p_ata)`, `remarcar_reuniao(p_reuniao, p_inicio, p_duracao)`, `cancelar_reuniao(p_reuniao)`; `lembrar_reunioes()` (service_role) + job a cada 5 min.
- [ ] Testes: visibilidade por loja; vendedora não cria; participante de outra loja recusado; participantes recebem aviso "Nova reunião"; registrar exige ata quando aconteceu; não participante vendedor não registra; remarcar sobe `sequencia`; lembrete único; anon não chama nada.

### Task 2: Regras puras — ICS e situação da reunião
**Files:** `src/lib/regras/reunioes.ts` (+test). **Produces:** `gerarIcs(eventos: EventoIcs[], metodo: "REQUEST" | "CANCEL" | "PUBLISH"): string`; `situacaoReuniao(r, agora): "proxima" | "agora" | "aguardando" | "sem_registro" | "aconteceu" | "nao_aconteceu" | "cancelada"`; `paraUtc(dataLocal: string, hora: string): string` (SP→UTC); `horaSP(iso): string`.

### Task 3: Telas, convites e feed
**Files:** `src/app/(app)/reunioes/{actions.ts,[id]/page.tsx,[id]/not-found.tsx}`, `src/components/reunioes/*`, `src/lib/avisos/email.ts` (anexo iCalendar), `src/app/agenda/[token]/route.ts`, `src/app/(app)/tarefas/page.tsx` (cards azuis de reunião + botão "Nova reunião"), `src/app/(app)/avisos/page.tsx` (link da agenda), `src/app/(app)/painel/page.tsx` (bloco Reuniões), `src/proxy.ts` (`/agenda`), `tests/e2e/reunioes.spec.ts`.
- [ ] e2e: gerente marca reunião → aparece na coluna dos participantes e e-mail com `text/calendar` chega; participante registra ata → painel mostra "aconteceu"; reunião passada sem registro aparece "sem registro" no painel; feed com token certo traz o evento, token errado 404; vendedora não vê "Nova reunião".
