# Design system — CRM Lojas

Referência visual: dashboard monocromático "iDraft" (Pinterest). Quadros no estilo Trello.
Implementação: Tailwind v4 + tokens em `src/app/globals.css` + componentes shadcn (base-nova) ajustados.

## Princípios

1. **Monocromático por padrão.** Preto, branco e cinzas. Destaque = preto (item ativo, botão principal, card de visão geral).
2. **Cor só com significado.** Vermelho = atrasado/parado; âmbar = atenção (vence hoje/amanhã, prazo pedido); verde = feito/vendido; azul = reunião. Nunca decorativa.
3. **Superfícies flutuantes.** Fundo cinza claro com brilho suave; tudo que é conteúdo fica em superfícies brancas arredondadas com sombra leve.
4. **Arredondado generoso.** Cards e janelas `rounded-3xl`; cards de quadro `rounded-2xl`; botões e filtros em pílula.

## Tokens

| Token (CSS) | Classe Tailwind | Uso |
|---|---|---|
| `--background` | `bg-background` | Fundo da página (cinza claro) |
| `--card` | `bg-card` | Superfícies (blocos, cards, menu) |
| `--primary` / `--primary-foreground` | `bg-primary` | Destaque: item ativo, botão principal, card escuro |
| `--muted` / `--muted-foreground` | `bg-muted`, `text-muted-foreground` | Hover, texto secundário |
| `--lista` | `bg-lista` | Fundo das colunas do quadro |
| `--destructive` | `text-destructive` | Atrasado, parado, erro |
| `--atencao` | `bg-atencao/20` | Vence hoje/amanhã, prazo pedido |
| `--sucesso` | `text-sucesso` | Feito, vendido |
| `--info` | `text-info` | Reunião |
| `--sombra-card` / `--sombra-card-hover` | `shadow-card`, `shadow-card-hover` | Elevação das superfícies |
| `--radius` (0.875rem) | `rounded-2xl` / `rounded-3xl` | Escala de raio |

Tipografia: Geist. Títulos de página `text-2xl font-semibold tracking-tight`; saudação `text-3xl`; números do card escuro `text-5xl`.

## Componentes

| Componente | Onde | Notas |
|---|---|---|
| `Button` | `components/ui/button.tsx` | Pílula (`rounded-full`). `default` = preto; `outline`/`ghost` para ações secundárias. |
| `Card`, `Dialog`, `Input`, `Textarea` | `components/ui/*` | `rounded-3xl`/`rounded-xl`, sem borda, `shadow-card`. |
| `Etiqueta` | `components/comum/quadro.tsx` | Etiqueta colorida estilo Trello: `cinza`, `preto`, `vermelho`, `ambar`, `verde`, `azul`, `rosa`, `roxo`. |
| `estiloQuadro`, `estiloColuna`, `estiloCard`, `CabecalhoColuna` | `components/comum/quadro.tsx` | Quadro: colunas `bg-lista` com contador em pílula; cards brancos com sombra que cresce no hover. |
| `AdicionarCard` | `components/comum/adicionar-card.tsx` | "+ Adicionar …" no fim da coluna: Enter adiciona e continua aberto, Esc fecha. |
| `ModalRota` | `components/comum/modal-rota.tsx` | Card aberto por cima do quadro (rotas interceptadas `@modal/(.)…`); recarregar mostra a página inteira. |
| `Bloco` | `components/painel/bloco.tsx` | Bloco branco do painel com `aria-label` = título. |
| Menu | `app/(app)/menu.tsx` | Lateral (computador) e barra inferior flutuante (celular); ativo em preto. |

## Padrões

- **Página do app:** saudação "Olá, Nome!" no topo + sino e avatar redondos; título da página `text-2xl`; filtros em pílula.
- **Quadro (Leads, Tarefas):** colunas lado a lado com rolagem horizontal; card mostra etiquetas no topo, título, valor e rodapé com relógio/responsável; clicar abre a janela do card.
- **Etiquetas por domínio:**
  - Lead: `Parado` (vermelho), temperatura `Quente` (vermelho) / `Morno` (âmbar) / `Frio` (azul), origem (`Instagram` rosa, `Prospecção` roxo, `Indicação` verde, demais cinza), `Vendido` (verde).
  - Tarefa: `Atrasada` (vermelho), `Hoje`/`Amanhã` (âmbar), `Fazendo` (preto), `Prazo pedido` (âmbar), `Recorrente` (cinza).
  - Reunião: `Reunião` (azul).
- **Painel:** card escuro de visão geral (números grandes) + blocos brancos em grade de 2 colunas.

## Acessibilidade

- Colunas são `<section aria-label="…">`; cards são links (teclado: Tab/Enter abre a janela; Esc fecha).
- Cor nunca é o único sinal: toda etiqueta tem texto.
- Itens duplicados para celular/computador ficam escondidos com `display:none` (fora da árvore de acessibilidade).

## Não fazer

| ✅ Fazer | ❌ Não fazer |
|---|---|
| Usar tokens (`bg-card`, `text-muted-foreground`) | Hex/oklch solto em componente (exceto tons das etiquetas em `quadro.tsx`) |
| Cor para estado (atrasado, feito) | Cor para enfeite |
| `Etiqueta` para status curto no card | `Badge` genérico dentro dos quadros |
