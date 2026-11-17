# Alerta de leads parados no celular — design curto

## Por quê
A dona (Ari) quer saber, sem abrir o sistema, quem está parado, com o contato e uma mensagem pronta para mandar.
Primeiro de três trabalhos (depois: Assistente que enxerga a loja; depois: Assistente pelo WhatsApp).

## O que existe
- `rotina_diaria()` (pg_cron, 08:00 SP) cria um aviso por lead parado para a responsável. Só conta `orcamento_enviado` e `negociacao`.
- `rotinaIA` (07:00–07:55 SP) gera temperatura, resumo e `sugestao_ia` só para esses mesmos parados.
- `leadParado()` em `src/lib/regras/leads.ts` decide o selo "parado" no card, a contagem do Painel e a fila da IA.
- O service worker só abre páginas do próprio CRM (proteção contra link externo em notificação).

## Decisões (do usuário)
- Cliente: parado depois do prazo da loja (`dias_lead_parado`, hoje 2) em qualquer etapa aberta (novo, em contato, orçamento, negociação).
- Parceiro: parado depois de 15 dias sem contato, em qualquer etapa aberta.
- Aviso traz contato e sugestão de mensagem; tocar abre o WhatsApp do lead com a mensagem escrita.
- Para não virar spam: no máximo 5 avisos de parado por pessoa por dia, mais um "e mais N parados" quando passar disso.

## Abordagens
- **Link direto `wa.me` na notificação**: descartado; exige liberar link externo no service worker e no e-mail.
- **Rota do CRM que redireciona (escolhida)**: `/leads/[id]/whatsapp` confere o login (RLS), lê telefone e sugestão atuais e redireciona para `wa.me`. Sem telefone, cai na página do lead. Mantém a proteção do service worker e funciona igual pelo e-mail.

## Mudanças
1. `leadParado(lead, diasLimite)` passa a receber `tipo`: etapas abertas; cliente usa `diasLimite`, parceiro usa 15 (constante `DIAS_PARCEIRO_PARADO`). Card, Painel e fila da IA seguem a regra nova sozinhos.
2. Migração nova recria `rotina_diaria()`: mesma regra em SQL; ordena por cliente antes de parceiro, etapa mais avançada primeiro, mais dias sem contato primeiro; 5 primeiros por responsável viram aviso (`titulo` "Parado: Nome", `texto` = dias sem contato + telefone formatado + sugestão da IA ou resumo; `link` = `/leads/<id>/whatsapp` se houver telefone, senão `/leads/<id>`); o resto vira um aviso "E mais N leads parados" com link `/leads`. Chaves de `avisar_uma_vez` continuam por lead e dia.
3. Rota `src/app/(app)/leads/[id]/whatsapp/route.ts` (GET): cliente do servidor (respeita RLS); lead não visível → `/leads`; sem telefone → `/leads/<id>`; senão redirect para `linkWhatsApp(telefone, sugestao_ia)`.
4. Fila da IA (`rotinaIA`): busca leads em qualquer etapa aberta com `tipo` e filtra por `leadParado` novo.
5. Prompt do lead recebe o tipo; para parceiro, a sugestão fala de parceria/indicação, não de compra.

## Fora
- WhatsApp como canal do aviso (trabalho 3).
- Escolher horário do aviso ou desligar por pessoa.

## Testes
- `leads.test.ts`: regra nova (cliente 2 dias em `novo`/`em_contato`; parceiro 14 vs 15 dias; vendido/perdido nunca).
- `avisos.test.ts` (banco local): 7 parados → 5 avisos + 1 "e mais 2"; parceiro de 10 dias não avisa; texto tem telefone e sugestão.
- e2e: abrir `/leads/<id>/whatsapp` redireciona para `wa.me` com a sugestão; lead de colega (vendedora) não redireciona.

## Depois do deploy
Ari precisa ativar as notificações no celular (iPhone: app instalado na tela inicial).
