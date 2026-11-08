# CRM Lojas

Leads (kanban), tarefas por pessoa com Cobrar, painel da dona e avisos (sino, push e e-mail) para as lojas.
Next.js 16 + Supabase. Design e planos em `docs/superpowers/`.

## Rodar no computador

Pré-requisitos: Node 22+, Docker em execução.

```bash
npm install
cp .env.example .env.local        # preencha com os valores do passo abaixo
npm run db:start                  # sobe o Supabase local e mostra as chaves
npm run db:reset                  # cria tabelas e as 2 lojas
npm run criar-dono -- voce@email.com "Seu Nome"
npm run dev                       # http://localhost:3000
```

- E-mails (convite, senha, avisos) caem no Mailpit: http://127.0.0.1:54324
- Painel do banco: http://127.0.0.1:54323

## Testes

```bash
npm test        # regras e acesso no banco (Vitest; exige db:start)
npm run e2e     # navegador (Playwright com o Chrome instalado; sobe o app sozinho)
```

## Publicar (produção) — Netlify + Supabase, planos grátis

Ordem importa: banco primeiro, site depois, segredos por último.

1. **Supabase** (supabase.com → New project, região São Paulo):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push            # cria tabelas, regras e rotinas (pg_cron); lojas no passo 5
   ```
   No painel do Supabase:
   - Authentication → Sign In / Providers → **desligar "Allow new users to sign up"** (conta só por convite).
   - Authentication → Emails → colar `supabase/templates/convite.html` (Invite user) e `recuperar-senha.html` (Reset password).
   - Authentication → SMTP Settings → SMTP do Resend (o mesmo do passo 3), senão os convites caem no limite de e-mails do Supabase.
2. **Netlify** (app.netlify.com → Add new project → Import from GitHub → `SinapiisDev/crm-lojas`, branch `main`).
   Em Site configuration → Environment variables, criar todas as de `.env.example` com valores de produção
   (Supabase: Project Settings → API; `NEXT_PUBLIC_SITE_URL` = `https://<nome>.netlify.app`; `AVISOS_SEGREDO` = texto longo aleatório).
   O primeiro build roda logo ao importar, antes das variáveis existirem: depois de criá-las, faça **Deploys → Trigger deploy**
   (as `NEXT_PUBLIC_*` entram no build). Depois, no Supabase → Authentication → URL Configuration: Site URL = endereço da Netlify;
   Redirect URLs = `<site>/auth/callback`.
3. **E-mail**: conta grátis no Resend, verificar um domínio (ou usar o de teste para começar), criar API key → `SMTP_*` e `EMAIL_REMETENTE`.
4. **Rotinas** (SQL Editor do Supabase), com o mesmo segredo do passo 2:
   ```sql
   select vault.create_secret('https://<nome>.netlify.app/api/avisos/despachar', 'avisos_url');
   select vault.create_secret('<AVISOS_SEGREDO>', 'avisos_segredo');
   ```
5. **Lojas e dona**: no SQL Editor, cadastrar a empresa e as lojas copiando **só os dois `insert`** de `supabase/seed.sql`
   (as linhas `vault.create_secret` de lá são do ambiente local; duplicar `avisos_url` quebra as rotinas). Depois, com um
   arquivo `.env.producao` (mesmas variáveis do passo 2, fora do git):
   `node --env-file=.env.producao scripts/criar-dono.ts dona@email.com "Nome da Dona"`.
6. **Manter acordado**: GitHub → Settings → Secrets and variables → Actions: variável `SITE_URL` = endereço da Netlify e
   secret `AVISOS_SEGREDO` = o mesmo do passo 2. O workflow "Manter Supabase acordado" chama `/api/saude` uma vez por dia
   (o Supabase grátis pausa após 7 dias sem uso). O GitHub desliga agendamentos após 60 dias sem atividade no repositório:
   se isso acontecer, reative em Actions.
7. **IA** (opcional): `ANTHROPIC_API_KEY` (console.anthropic.com, créditos pré-pagos) e `AI_MODEL` na Netlify.
   Sem os dois, a IA fica desligada e o resto funciona igual.
8. **Login Google** (opcional): credencial OAuth no Google Cloud e ativar o provedor Google no Supabase.

Limites dos planos grátis (conferir antes de publicar): Netlify trabalha com créditos mensais (cada deploy gasta créditos;
acabou, o site pausa até o mês seguinte) e funções síncronas param em 60 s — por isso as rotinas trabalham em lotes
com prazo (`TEMPO_MAX_MS`, padrão 25000). O `db push` cria as extensões `pg_cron` e `pg_net` no projeto; se falhar,
ative-as em Database → Extensions e rode de novo. Supabase grátis: 500 MB de banco e pausa após 7 dias sem uso.
Push só funciona em HTTPS; no iPhone, o CRM precisa estar na Tela de Início.
