import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarDataHora } from "@/lib/formatar";
import { ETAPAS, ORIGENS, diasSemContato, leadParado, type Etapa, type Origem, type TipoLead } from "@/lib/regras/leads";
import { diaSP, periodo, resumoPorLoja, tarefasAtrasadas, type LeadPainel, type LojaPainel, type TarefaPainel } from "@/lib/regras/painel";
import { hojeSP } from "@/lib/regras/tarefas";

// Retrato da loja para o Assistente: todo número sai daqui (código), nunca da IA.
// Funil/vendas/conversão de clientes vêm das mesmas contas do Painel.

export type LeadRetrato = LeadPainel & {
  id: string;
  nome: string;
  tipo: TipoLead;
  origem: Origem;
  vendedor_id: string;
  valor_estimado: number | null;
};
export type DadosRetrato = {
  lojas: LojaPainel[];
  leads: LeadRetrato[];
  eventos: { loja_id: string; autor_id: string | null; tipo: string; criado_em: string }[]; // últimos 30 dias
  tarefas: TarefaPainel[];
  reunioes: { loja_id: string; titulo: string; inicio: string }[]; // próximos 7 dias
  pessoas: { id: string; nome: string; loja_id: string }[];
  memorias: { loja_id: string; texto: string }[];
  parcial: boolean;
};

const LIMITE_LEADS = 2000;
const LIMITE_EVENTOS = 2000;
const ABERTAS: Etapa[] = ["novo", "em_contato", "orcamento_enviado", "negociacao"];
const CONTATO = new Set(["contato", "whatsapp", "reuniao"]);
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const PESO_ETAPA: Partial<Record<Etapa, number>> = { negociacao: 0, orcamento_enviado: 1, em_contato: 2, novo: 3 };
const DIA_MS = 86_400_000;

const titulo = (e: Etapa) => ETAPAS.find((x) => x.id === e)?.titulo ?? e;
const reais = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
// Texto de usuário não pode abrir/fechar os blocos do pedido da IA.
const limpar = (s: string) => s.replace(/<\/?(conversa|retrato|dados)>/gi, "[…]").trim();
const diaSemana = (iso: string) => new Date(diaSP(iso) + "T12:00:00Z").getUTCDay();

// Mesma ordem do aviso das 8h (rotina_diaria / fila_ia).
const urgencia = (a: LeadRetrato, b: LeadRetrato) =>
  Number(a.tipo === "parceiro") - Number(b.tipo === "parceiro") ||
  (PESO_ETAPA[a.etapa] ?? 9) - (PESO_ETAPA[b.etapa] ?? 9) ||
  Date.parse(a.ultimo_contato_em) - Date.parse(b.ultimo_contato_em) ||
  a.id.localeCompare(b.id);

function blocoLoja(d: DadosRetrato, loja: LojaPainel, agora: Date, maxParados: number): string[] {
  const hoje = hojeSP(agora);
  const leads = d.leads.filter((l) => l.loja_id === loja.id);
  const clientes = leads.filter((l) => l.tipo === "cliente");
  const parceiros = leads.filter((l) => l.tipo === "parceiro");

  const funil = ABERTAS.map((e) => {
    const daEtapa = clientes.filter((l) => l.etapa === e);
    return `${titulo(e)} ${daEtapa.length} (${reais(daEtapa.reduce((s, l) => s + Number(l.valor_estimado ?? 0), 0))})`;
  }).join(" · ");
  const parc = ABERTAS.map((e) => `${titulo(e)} ${parceiros.filter((l) => l.etapa === e).length}`).join(" · ");

  const [atual] = resumoPorLoja([loja], clientes, periodo(30, hoje), agora);
  const [antes] = resumoPorLoja([loja], clientes, periodo(30, hojeSP(new Date(agora.getTime() - 30 * DIA_MS))), agora);

  const desde90 = hojeSP(new Date(agora.getTime() - 89 * DIA_MS));
  const recentes = clientes.filter((l) => diaSP(l.criado_em) >= desde90);
  const origem = ORIGENS.map((o) => {
    const daOrigem = recentes.filter((l) => l.origem === o.id);
    return daOrigem.length ? `${o.titulo} ${daOrigem.length} → ${daOrigem.filter((l) => l.etapa === "vendido").length}` : null;
  }).filter(Boolean);

  const parados = leads.filter((l) => leadParado(l, loja.dias_lead_parado, agora)).sort(urgencia);

  const desde7 = agora.getTime() - 7 * DIA_MS;
  const eventos = d.eventos.filter((e) => e.loja_id === loja.id && CONTATO.has(e.tipo));
  const tarefas = d.tarefas.filter((t) => t.loja_id === loja.id);
  const pessoas = d.pessoas.filter((p) => p.loja_id === loja.id).sort((a, b) => a.nome.localeCompare(b.nome));
  const porDia = DIAS.map((_, i) => eventos.filter((e) => diaSemana(e.criado_em) === i).length);
  const atrasadas = tarefasAtrasadas(tarefas, hoje).slice(0, 5);
  const reunioes = d.reunioes.filter((r) => r.loja_id === loja.id).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 5);
  const memorias = d.memorias.filter((m) => m.loja_id === loja.id);

  return [
    `## Loja: ${limpar(loja.nome)}`,
    `Funil de clientes: ${funil}`,
    `Parceiros: ${parc}`,
    `Vendas 30 dias: ${atual.vendidos} (${reais(atual.valorVendido)}) · conversão ${atual.conversao}% · 30 dias antes: ${antes.vendidos} (${reais(antes.valorVendido)})`,
    `Origem 90 dias (clientes criados → vendidos): ${origem.join(" · ") || "nenhum"}`,
    `Parados: ${parados.length}.${parados.length ? " Mais urgentes:" : ""}`,
    ...parados
      .slice(0, maxParados)
      .map((l) => `- ${limpar(l.nome)} (${l.tipo}, ${titulo(l.etapa)}, ${diasSemContato(l.ultimo_contato_em, agora)} dias, ${limpar(l.vendedor)})`),
    "Últimos 7 dias por pessoa (contatos inclui WhatsApp aberto pelo CRM):",
    ...pessoas.map((p) => {
      const contatos = eventos.filter((e) => e.autor_id === p.id && Date.parse(e.criado_em) >= desde7).length;
      const abertos = leads.filter((l) => l.vendedor_id === p.id && ABERTAS.includes(l.etapa)).length;
      const feitas = tarefas.filter((t) => t.responsavel === p.nome && t.status === "feito" && t.concluida_em && Date.parse(t.concluida_em) >= desde7).length;
      const atrasadasP = tarefas.filter((t) => t.responsavel === p.nome && t.status !== "feito" && t.prazo < hoje).length;
      return `- ${limpar(p.nome)}: ${contatos} contatos, ${abertos} leads abertos, ${feitas} tarefas feitas, ${atrasadasP} atrasadas`;
    }),
    `Contatos por dia da semana (30 dias): ${DIAS.map((dia, i) => `${dia} ${porDia[i]}`).join(" · ")}`,
    `Tarefas atrasadas: ${atrasadas.length ? "" : "nenhuma"}`,
    ...atrasadas.map((t) => `- ${limpar(t.titulo)} (${limpar(t.responsavel)}, venceu ${t.prazo.slice(8, 10)}/${t.prazo.slice(5, 7)})`),
    `Reuniões nos próximos 7 dias: ${reunioes.length ? "" : "nenhuma"}`,
    ...reunioes.map((r) => `- ${limpar(r.titulo)} (${formatarDataHora(r.inicio)})`),
    `Memória da loja:${memorias.length ? "" : " nenhuma"}`,
    ...memorias.map((m) => `- ${limpar(m.texto)}`),
  ];
}

export function montarRetrato(d: DadosRetrato, agora = new Date()): string {
  // ≈ 2.500 tokens por loja; com mais de 2 lojas a lista de parados encolhe para caber em ≈ 6.000.
  const maxParados = d.lojas.length > 2 ? 5 : 10;
  const linhas = d.lojas.flatMap((l) => [...blocoLoja(d, l, agora, maxParados), ""]);
  if (d.parcial) linhas.push("(dados parciais)");
  return linhas.join("\n").trim();
}

const nome = (p: unknown) => (p as { nome: string } | null)?.nome ?? "—";

// Lê com o cliente recebido: o do usuário (RLS) no chat, o admin na rotina das sugestões.
export async function carregarRetrato(supabase: SupabaseClient, lojas: LojaPainel[], agora = new Date()): Promise<DadosRetrato> {
  const ids = lojas.map((l) => l.id);
  const desde30 = new Date(agora.getTime() - 30 * DIA_MS).toISOString();
  const ate7 = new Date(agora.getTime() + 7 * DIA_MS).toISOString();
  const desde7 = new Date(agora.getTime() - 7 * DIA_MS).toISOString();
  const [leads, eventos, tarefas, reunioes, membros, memorias] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nome, loja_id, vendedor_id, etapa, tipo, origem, valor_estimado, valor_vendido, criado_em, fechado_em, ultimo_contato_em, perfis!leads_vendedor_id_fkey(nome)")
      .in("loja_id", ids)
      .limit(LIMITE_LEADS),
    supabase
      .from("lead_eventos")
      .select("autor_id, tipo, criado_em, leads!inner(loja_id)")
      .in("leads.loja_id", ids)
      .gte("criado_em", desde30)
      .limit(LIMITE_EVENTOS),
    supabase
      .from("tarefas")
      .select("id, loja_id, titulo, prazo, status, concluida_em, perfis!tarefas_responsavel_id_fkey(nome)")
      .in("loja_id", ids)
      .or(`status.neq.feito,concluida_em.gte.${desde7}`)
      .limit(1000),
    supabase.from("reunioes").select("loja_id, titulo, inicio").in("loja_id", ids).eq("cancelada", false).gte("inicio", agora.toISOString()).lte("inicio", ate7),
    supabase.from("membros").select("usuario_id, loja_id, perfis(nome)").in("loja_id", ids),
    supabase.from("memorias_ia").select("loja_id, texto").in("loja_id", ids).order("criado_em"),
  ]);
  return {
    lojas,
    leads: (leads.data ?? []).map(({ perfis, ...l }) => ({ ...l, vendedor: nome(perfis) }) as LeadRetrato),
    eventos: (eventos.data ?? []).map(({ leads: l, ...e }) => ({ ...e, loja_id: (l as unknown as { loja_id: string }).loja_id })),
    tarefas: (tarefas.data ?? []).map(({ perfis, ...t }) => ({ ...t, responsavel: nome(perfis) }) as TarefaPainel),
    reunioes: reunioes.data ?? [],
    pessoas: (membros.data ?? []).map((m) => ({ id: m.usuario_id, nome: nome(m.perfis), loja_id: m.loja_id })),
    memorias: memorias.data ?? [],
    parcial: (leads.data?.length ?? 0) >= LIMITE_LEADS || (eventos.data?.length ?? 0) >= LIMITE_EVENTOS,
  };
}
