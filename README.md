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

## Publicar (produção)

1. **Supabase online**
   - Criar projeto; rodar as migrations (`npx supabase link` + `npx supabase db push`).
   - Authentication → Sign In / Providers: **desligar "Allow new users to sign up"** (conta só nasce por convite).
   - Authentication → Emails: copiar `supabase/templates/convite.html` (Invite) e `recuperar-senha.html` (Reset password).
   - Authentication → URL Configuration: Site URL = endereço do CRM; Redirect URLs = `<site>/auth/callback`.
   - SQL Editor, segredos do despacho de avisos (mesmo segredo de `AVISOS_SEGREDO`):
     ```sql
     select vault.create_secret('https://SEU-SITE/api/avisos/despachar', 'avisos_url');
     select vault.create_secret('UM-SEGREDO-LONGO-E-ALEATORIO', 'avisos_segredo');
     ```
2. **Variáveis de ambiente** no provedor (Cloudflare/Netlify): todas as de `.env.example`, com valores de produção.
   Faltando qualquer uma das de push/e-mail, o despacho recusa rodar (os avisos ficam na fila, nada se perde).
3. **E-mail**: conta grátis no Resend, domínio verificado, SMTP conforme `.env.example`.
4. **Push**: só funciona em HTTPS. No iPhone, o CRM precisa estar adicionado à Tela de Início.
5. **Login Google** (opcional): credencial OAuth no Google Cloud e ativar o provedor Google no Supabase.
