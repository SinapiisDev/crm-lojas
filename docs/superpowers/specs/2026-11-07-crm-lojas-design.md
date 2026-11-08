# CRM Lojas — Design

Data: 2026-11-07 · Status: aprovado em conversa (brainstorm); modelo de IA pendente (reunião 2026-11-10)

## 1. Intenção e porquê

Duas lojas da mesma dona hoje funcionam "no bate-boca": ninguém sabe quem é responsável pelo quê, tarefas não têm prazo nem registro de conclusão, reuniões marcadas não acontecem, e leads esfriam porque a vendedora conversa com muita gente, manda um orçamento básico e não volta a procurar o cliente.

O sistema existe para que, em um olhar, dê para saber **em que pé está cada lead e cada tarefa**, e para que a cobrança fique registrada em vez de virar discussão.

Sucesso: a dona abre o painel segunda de manhã e sabe quantos leads entraram, quantos viraram venda, quanto foi vendido por loja e quem está com tarefa atrasada — e cobra pelo próprio sistema.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos (v1)**
- Kanban de leads por loja com alerta de lead parado.
- Quadro de tarefas com colunas por pessoa, prazos, avisos e botão "Cobrar".
- Reuniões com Google Agenda e registro de "aconteceu + ata".
- Painel da dona (semana/mês, por loja).
- Notificações push (PWA) + e-mail.
- Agente de IA de follow-up (lembrete com contexto, temperatura do lead, resumo semanal).
- Instalável no Android e iPhone como PWA, custo zero de loja de apps.

**Não-objetivos (v1)**
- Ler conversas do WhatsApp/Instagram automaticamente (fase 2/3, ver §9).
- Publicar na Play Store / App Store.
- Login com Apple.
- Permissões diferentes entre sócios da mesma loja.
- Chat "pergunte ao CRM".
- Vender o CRM para outras empresas (mas o modelo de dados não pode impedir — ver `empresa_id`).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Vendedora ter que preencher muita coisa para registrar um contato — se registrar for chato, ninguém registra e o sistema morre.
- Qualquer pessoa com Gmail conseguir entrar.
- Vendedora ver leads de colega.
- Conta mensal surpresa (tudo no plano grátis, exceto IA, com custo conhecido).

## 3. Pessoas e acessos

- Loja 1: Dona (chefe), Gerente, 1 Vendedora.
- Loja 2: Sócios — chefe, sócia (arquiteta), sócio (financeiro/jurídico); 1 Conferente; 2 Vendedoras (uma arquiteta).
- ~9 usuários.

Cargo é **por loja** (tabela de vínculo usuário × loja × cargo). Uma pessoa pode estar em várias lojas.

| Cargo | Leads | Tarefas | Painel | Cria tarefa para outros | Convida usuários |
|---|---|---|---|---|---|
| Dono/Sócio | todos da loja | todas da loja | completo | sim | sim |
| Gerente | todos da loja | todas da loja | vendas (sem financeiro) | sim | sim (só na loja dela) |
| Vendedor | **só os próprios** | todas da loja | não | não (só para si) | não |
| Conferente | nenhum | todas da loja | não | não (só para si) | não |

Quem é Dono em mais de uma loja vê a visão "Todas as lojas" no painel.

Acesso aplicado no banco via Row Level Security do Supabase (não só na interface).

## 4. Leads

Card de lead: nome, telefone, origem (Instagram, Loja física, Prospecção, Indicação, Outro), loja, vendedora responsável, valor estimado, data do último contato, temperatura (IA), anotações/histórico.

Etapas: **Novo → Em contato → Orçamento enviado → Negociação → Vendido | Perdido**.

- Registrar contato = 1 clique + anotação curta (obrigatória, 1 linha). Atualiza "último contato".
- Botão **WhatsApp**: abre `https://wa.me/55<telefone>?text=<mensagem>`; ao clicar, registra contato "via WhatsApp" automaticamente.
- Mover para **Vendido** pede o valor vendido (obrigatório).
- Mover para **Perdido** pede motivo (preço, sumiu, comprou no concorrente, outro + texto).
- **Lead parado**: em Orçamento enviado ou Negociação há ≥ 2 dias sem contato → notificação à vendedora + card vermelho. Prazo de 2 dias configurável por loja.

## 5. Tarefas e reuniões

Quadro com **colunas por pessoa** (escolhido no brainstorm). Filtros: loja, semana, esconder feitas.

Tarefa: título, descrição, responsável, loja, prazo, status (A fazer / Fazendo / Feito), recorrência opcional (diária/semanal/mensal), histórico.

- Notificação ao responsável quando recebe tarefa.
- Lembrete na véspera do prazo; aviso quando atrasa (responsável + gerente).
- Concluir registra quem e quando.
- Tarefa recorrente se recria sozinha ao concluir/vencer.

**Botão Cobrar** (Dono/Sócio/Gerente):
1. Abre mensagem pré-preenchida editável ("Oi Bruno, a tarefa X venceu há 3 dias. Me dá um retorno até hoje?").
2. Envia push e grava como comentário na tarefa.
3. Responsável responde com **Concluir** ou **Pedir novo prazo** (motivo obrigatório).
4. Quem cobrou aprova/recusa o novo prazo com um clique.
5. Histórico mostra cobranças, respostas e quantas vezes o prazo mudou.

**Reunião** = tipo especial de tarefa: data/hora, participantes, local/link.
- Cria evento no Google Agenda de cada participante (Google Calendar API) + link `.ics` para quem não usa Google.
- Lembrete 1h antes.
- Depois do horário: alguém marca "aconteceu" e escreve a ata (decisões). Sem registro em 24h → aparece como "sem registro" no painel.

## 6. Painel da dona

(Esboço aprovado.) Filtro loja (Todas / Loja 1 / Loja 2) e período (Semana / Mês).

1. Tabela por loja: leads novos (▲▼ vs período anterior), vendidos, conversão %, valor vendido, leads parados.
2. Tarefas atrasadas com botão Cobrar.
3. Tarefas do período por pessoa: feitas no prazo / atrasadas / abertas.
4. Reuniões: aconteceu + ata / sem registro / próximas.
5. Vendas por vendedora: leads, vendidos, valor.

## 7. Login e convites

Visual inspirado no login da AVLE (projeto do próprio usuário em `~/Projetos/avle-web`): tela dividida, marca à esquerda (fundo escuro, logo, frase), cartão à direita; no celular só o cartão.

- **E-mail + senha** e **Entrar com Google**. "Manter conectado" (sessão 30 dias). "Esqueci a senha".
- **Sem auto-cadastro.** Dono/Gerente convida por e-mail escolhendo loja e cargo; o convidado define senha ou entra com Google com o mesmo e-mail. E-mail não convidado é barrado (inclusive via Google).
- Sem Apple (exige conta Apple Developer, US$99/ano).

## 8. Agente de IA

O **quando** é regra fixa (cron); a IA só escreve o **conteúdo**.

1. **Lembrete com contexto** para lead parado: resumo do histórico + sugestão de mensagem; botão abre WhatsApp com a mensagem pronta.
2. **Temperatura** (quente/morno/frio) recalculada a cada anotação registrada.
3. **Resumo semanal** (segunda cedo) para Donos, ao lado do painel.

Limite v1: a IA só conhece o que foi registrado no CRM.

**Modelo: pendente** (decisão da dona em 2026-11-10). Estimativa ~1.500 chamadas/mês: Opus 5.5 ~US$27, Sonnet 5.5 ~US$14, Haiku 5.5 ~US$0,70. Modelo fica em variável de ambiente (`AI_MODEL`); padrão até a decisão: desligado (sistema funciona sem IA — lembretes saem sem a sugestão de mensagem).

## 9. WhatsApp e Instagram (fases)

- **v1:** link `wa.me` + registro automático do clique. Custo zero. Funciona com número pessoal.
- **Fase 2:** Instagram DM → cria lead em "Novo" com origem Instagram, via API oficial da Meta (grátis; exige conta profissional ligada a página do Facebook + aprovação do app).
- **Fase 3:** quando cada loja tiver número próprio (em andamento), WhatsApp Cloud API oficial: mensagens entram no CRM e atualizam último contato. Custo por mensagem (Brasil, out/2026, fontes terceiras): resposta dentro de 24h grátis ou ~R$0,035; utilidade ~R$0,035; marketing ~R$0,32. Número da loja fica cadastrado na tabela de lojas desde a v1.
- **Proibido:** APIs não oficiais (Evolution, Z-API, Baileys) — risco de banimento do número.

## 10. Stack e hospedagem (decisões técnicas)

- **Next.js 16 (App Router) + TypeScript + Tailwind v4**, criado com `create-next-app` em `~/Projetos/crm-lojas`.
- **UI:** shadcn/ui; arrastar cards com `dnd-kit`.
- **Banco/Auth/Realtime/Storage:** Supabase (Postgres + RLS + Auth com e-mail/Google + Realtime para o kanban atualizar ao vivo + `pg_cron` para regras diárias).
- **Multi-empresa futuro:** toda tabela de negócio tem `empresa_id` (hoje uma empresa só).
- **E-mail:** Resend (SMTP do Supabase Auth + notificações).
- **Push:** Web Push (VAPID) via service worker do PWA. iPhone exige iOS 16.4+ e app adicionado à tela inicial.
- **PWA:** manifest + service worker; instalável Android/iOS.
- **Calendário:** Google Calendar API + feed `.ics`.
- **Hospedagem:** Cloudflare (Workers/Pages via OpenNext) ou Netlify — **não** Vercel Hobby (proíbe uso comercial).
- **Fuso:** America/Sao_Paulo em todas as regras de prazo.

Riscos conhecidos:
- Supabase free pausa o projeto após 1 semana sem uso (com uso diário não acontece).
- Limites dos planos grátis não reconferidos nesta data.

## 11. Deixado para quem implementar

- Modelo de dados exato (tabelas, índices, políticas RLS) seguindo §3–§6.
- Ordem de construção (sugestão: auth+convites → leads → tarefas → painel → notificações → reuniões/Calendar → IA).
- Textos da interface, cores e logo (marca da empresa ainda não definida; usar placeholder "Nome da empresa").
- Escolha final Cloudflare vs Netlify.
