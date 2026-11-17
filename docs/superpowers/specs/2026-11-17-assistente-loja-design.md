# Assistente que enxerga a loja — design

## Por quê
O Assistente hoje só transforma pedido ditado em tarefas e leads. O usuário (dono do produto) quer um diferencial: um assistente que
converse, dê sugestões e "aprenda padrões de rotina" da loja, para a dona (Ari, Simonetto Guarapuava) gerir a equipe sem caçar números.
Segundo de três trabalhos: 1) aviso de leads parados (feito, PR #21/#22); 2) este; 3) o mesmo Assistente pelo WhatsApp (depende deste).

## Estado atual
- `src/lib/ia/assistente.ts`: `SISTEMA_ASSISTENTE`, `promptAssistente(dados)`, `FormatoAssistente` {resposta, tarefas, leads}, `validarPropostas`, `validarLeads`, `responderAssistente(dados, modelo?)` (maxTokens 8000).
- `src/app/(app)/assistente/actions.ts`: `conversar(conversa, pendentes, pendentesLeads)` (últimas 20 mensagens, equipe das lojas geridas) e `criarPropostas`.
- `chat.tsx`: estado só no navegador (`useState`) — recarregar perde tudo. Página só para dono/gerente (`podeGerir`).
- IA via `criarModelo()` (OpenAI `gpt-6-luna` em produção; saída estruturada com zod; nunca lança, falha → `null`).
- Rotina da IA (`rotinaIA`, cron 07:00–07:55 a cada 5 min) já gera análises de leads e o resumo semanal da segunda.
- Dados disponíveis: `leads` (etapa, tipo, origem, valores, `ultimo_contato_em`, `criado_em`, `fechado_em`, temperatura, vendedor), `lead_eventos` (tipo, autor, data), `tarefas` (status, prazo, responsável, `concluida_em`), `reunioes`, `resumos_semanais`. Simonetto hoje: 142 leads, 287 eventos, 0 tarefas, 0 reuniões.

## Objetivos
1. **Retrato da loja** em toda mensagem: números calculados no código (não pela IA), para o Assistente responder perguntas ("quem está mais devagar?", "em quais parceiros insistir?") e sugerir com base em dado real.
2. **Memória da loja** ("aprender"): regras e preferências que a dona confirma ("cobrança de parceiro é às terças"); entram em toda conversa; ela vê e apaga.
3. **Sugestões do dia**: ao abrir o Assistente, até 3 sugestões geradas uma vez por dia por loja; cada uma com um botão que manda o pedido pronto para o chat (vira proposta que ela confirma, fluxo atual).
4. **Conversa salva**: recarregar ou trocar de aparelho não perde a conversa nem as propostas pendentes; botão "Nova conversa".

## Não-objetivos
- A IA nunca altera dados sem confirmação; nunca manda WhatsApp.
- Nada de treinar modelo; "aprender" = memória confirmada + estatística sobre os dados.
- Vendedora continua sem acesso ao Assistente.
- A IA consultar o banco sozinha (ferramentas/agente) — fica para depois, se o retrato não bastar.

## Anti-objetivos (seria fracasso mesmo funcionando)
- Número inventado ou errado no retrato (a IA "achando" dado). Todo número vem do código.
- Memória gravada sem a dona confirmar, ou dado de uma loja aparecendo para quem não gere essa loja.
- Resposta lenta (> ~8 s) ou cara (> ~US$ 0,005 por mensagem).

## Abordagens consideradas
- **A. Retrato calculado + memória + sugestões do dia (escolhida pelo usuário).** Previsível, barato, testável; perguntas limitadas ao que o retrato cobre.
- B. Agente com ferramentas consultando o banco. Responde quase tudo, mas 5–15 s por resposta, mais caro, mais difícil garantir isolamento entre lojas. Pode vir depois.
- C. Só quadro de sugestões no Painel. Barato, mas não conversa — contraria o pedido.

## Design

### Retrato da loja (`src/lib/ia/retrato.ts`)
- `carregarRetrato(supabase, lojas: {id, nome, dias_lead_parado}[], agora)` lê com o cliente do usuário (RLS) e devolve `DadosRetrato`; `montarRetrato(dados, agora): string` é pura (testável) e gera texto compacto (alvo ≤ 2.500 tokens), por loja:
  - Funil de **clientes** por etapa aberta (quantidade e soma de `valor_estimado`); parceiros por etapa (quantidade).
  - Vendas: últimos 30 dias (quantidade, valor, conversão = vendidos ÷ criados no período) e comparação com os 30 anteriores.
  - Origem (90 dias, clientes): criados e vendidos por origem.
  - Parados (regra `leadParado`): total e os 10 mais urgentes (mesma ordem do aviso das 8h) com nome, tipo, etapa, dias, responsável.
  - Por pessoa, últimos 7 dias: contatos registrados, leads abertos sob ela, tarefas concluídas, tarefas atrasadas.
    **Contato registrado** = `lead_eventos` com `autor_id` da pessoa e `tipo` em (`contato`, `whatsapp`, `reuniao`), em leads de cliente **e** de parceiro (prospecção de parceiro é trabalho). O texto do retrato diz "contatos (inclui WhatsApp aberto pelo CRM)", porque `whatsapp` também é gravado ao abrir o link. *(decisão do implementador)*
  - Padrão de rotina: contatos registrados por dia da semana nos últimos 30 dias (fuso de São Paulo).
  - Tarefas atrasadas (até 5) e reuniões dos próximos 7 dias (até 5).
  - Memória da loja (abaixo).
- Limites de leitura (ex.: 2.000 leads, 2.000 eventos de 30 dias); ao bater o limite, o texto diz "dados parciais".
- **Reusar o Painel**: funil/vendas/conversão de clientes vêm de `periodo`, `resumoPorLoja` e `vendasPorVendedora` (`src/lib/regras/painel.ts`), para Assistente e Painel mostrarem o mesmo número. Código novo só para o que o Painel não tem (parceiros, origem, atividade por pessoa, dia da semana). *(decisão do implementador)*
- **Tamanho**: alvo ≈ 2.500 tokens por loja e ≈ 6.000 no total; com mais de 2 lojas, a lista de parados cai de 10 para 5 por loja. *(decisão do implementador)*
- Texto livre de usuário (nomes, títulos) passa pelo mesmo `limpar` que neutraliza as tags do prompt.

### Memória da loja
- Tabela `memorias_ia` (`id`, `loja_id`, `texto` ≤ 300, `criado_por`, `criado_em`). RLS: dono/gerente da loja lê, cria e apaga; vendedora não vê.
- `FormatoAssistente` ganha `memorias: {loja_id, texto}[]` com a mesma regra de `tarefas`/`leads`: a **lista COMPLETA** de memórias propostas e ainda não confirmadas nesta conversa (inclui as anteriores; tira as que ela mandou tirar). Só entra regra/preferência que a dona disse que vale "daqui pra frente"; as já gravadas vêm no retrato e não são repropostas.
- Aparecem no chat como "Lembrar: …" e são confirmadas pelo mesmo botão de criar (`criarPropostas` ganha `memorias`). *(decisão do implementador)*
- Até 30 por loja, conferido na ação de criar (acima disso, aquela memória falha com "apague alguma antes"). Lista na página do Assistente com botão de apagar.

### Sugestões do dia
- Tabela `sugestoes_ia` (`loja_id`, `dia`, `itens` jsonb, `criado_em`; único por loja+dia). RLS: dono/gerente da loja lê; só o servidor grava.
- `rotinaIA` gera, para cada loja com gerência, até 3 itens `{texto (o que notou, ≤ 200), pedido (instrução pronta para o Assistente, ≤ 300)}` a partir do retrato da loja (cliente admin, sem RLS). Roda antes das análises de leads (como o resumo de segunda).
- Página: acima do chat, cartões do dia; botão "Fazer isso" envia `pedido` como mensagem da dona. Sem sugestão do dia (IA desligada/falhou): nada aparece.

### Conversa salva
- Tabela `conversas_ia` (`usuario_id` pk, `mensagens` jsonb, `tarefas` jsonb, `leads` jsonb, `memorias` jsonb, `atualizado_em`). RLS: só o próprio usuário.
- **O servidor é a fonte da verdade** *(decisão do implementador)*:
  - `conversar(texto)` recebe só a mensagem nova; carrega a linha, anexa, chama a IA com as últimas 20, grava (máx. 40 mensagens) e devolve o estado inteiro.
  - Tirar uma proposta (X) chama uma ação que grava a remoção (não volta ao recarregar nem em outro aparelho).
  - Confirmar cria as propostas e tira da linha só as criadas; as que falharam ficam para nova tentativa. A conversa **não** é apagada (agora é um chat contínuo).
  - "Nova conversa" apaga a linha.
  - Ao ler, propostas são revalidadas (`validarPropostas`, `validarLeads`) contra a equipe atual.

### Prompt
- `SISTEMA_ASSISTENTE` ganha: pode responder perguntas e sugerir com base no retrato; números só do retrato (se não estiver lá, diz que não sabe); resposta até ~5 frases; propor memória só quando a dona disser algo que vale "daqui pra frente".
- Ordem do pedido: retrato + memória primeiro (estável, ajuda cache do provedor), depois equipe, propostas e conversa.

## Custo
Retrato ~2–3 mil tokens por mensagem + sugestões 1 chamada/loja/dia. Com `gpt-6-luna` (~US$ 0,10/0,50 por milhão): < US$ 0,001 por mensagem; mês típico < US$ 1 a mais.

## Testes
- `montarRetrato` (puro): números de funil, conversão, parados na ordem do aviso, contatos por dia da semana em SP, "dados parciais", nomes com `</conversa>` neutralizados.
- RLS (`tests/rls.test.ts`): memória e sugestões invisíveis para vendedora e para outra loja; conversa só do dono.
- IA com modelo falso: retrato e memória entram no pedido; memória proposta só é gravada ao confirmar; sugestões do dia geradas uma vez por loja/dia.
- e2e: conversa sobrevive ao recarregar; "Nova conversa" limpa; "Fazer isso" manda o pedido; lembrar e apagar memória.

## Deixado ao implementador
Nomes internos, layout dos cartões (seguir componentes atuais), formato exato do texto do retrato dentro dos limites acima.
