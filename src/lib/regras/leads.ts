export type Etapa = "novo" | "em_contato" | "orcamento_enviado" | "negociacao" | "vendido" | "perdido";
export type Origem = "instagram" | "loja_fisica" | "prospeccao" | "indicacao" | "outro";

export const ETAPAS: { id: Etapa; titulo: string }[] = [
  { id: "novo", titulo: "Novo" },
  { id: "em_contato", titulo: "Em contato" },
  { id: "orcamento_enviado", titulo: "Orçamento enviado" },
  { id: "negociacao", titulo: "Negociação" },
  { id: "vendido", titulo: "Vendido" },
  { id: "perdido", titulo: "Perdido" },
];

export const ORIGENS: { id: Origem; titulo: string }[] = [
  { id: "instagram", titulo: "Instagram" },
  { id: "loja_fisica", titulo: "Loja física" },
  { id: "prospeccao", titulo: "Prospecção" },
  { id: "indicacao", titulo: "Indicação" },
  { id: "outro", titulo: "Outro" },
];

export type TipoLead = "cliente" | "parceiro";
export const TIPOS: { id: TipoLead; titulo: string }[] = [
  { id: "cliente", titulo: "Clientes" },
  { id: "parceiro", titulo: "Parceiros" },
];

export type FiltroLeads = { tipo: TipoLead; busca?: string; temperatura?: string; vendedor?: string; origem?: string };
type LeadFiltravel = { nome: string; telefone: string; tipo: TipoLead; temperatura: string | null; vendedor: string | null; origem: string };

// Sem acento e minúsculo: "Simoes" acha "Simões".
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Busca por nome (sem acento) ou por dígitos do telefone; filtros vazios não filtram. "sem" = sem temperatura.
export function filtrarLeads<T extends LeadFiltravel>(leads: T[], f: FiltroLeads): T[] {
  const termo = normalizar(f.busca?.trim() ?? "");
  const digitos = termo.replace(/\D/g, "");
  return leads.filter(
    (l) =>
      l.tipo === f.tipo &&
      (!termo || normalizar(l.nome).includes(termo) || (digitos.length >= 3 && l.telefone.replace(/\D/g, "").includes(digitos))) &&
      (!f.temperatura || (f.temperatura === "sem" ? !l.temperatura : l.temperatura === f.temperatura)) &&
      (!f.vendedor || l.vendedor === f.vendedor) &&
      (!f.origem || l.origem === f.origem),
  );
}

export const MOTIVOS_PERDA = ["Preço", "Sumiu", "Comprou no concorrente", "Outro"];

const DIA_MS = 86_400_000;

export function diasSemContato(ultimo: string, agora = new Date()): number {
  return Math.floor((agora.getTime() - new Date(ultimo).getTime()) / DIA_MS);
}

export function leadParado(
  lead: { etapa: Etapa; ultimo_contato_em: string },
  diasLimite: number,
  agora = new Date(),
): boolean {
  if (lead.etapa !== "orcamento_enviado" && lead.etapa !== "negociacao") return false;
  return diasSemContato(lead.ultimo_contato_em, agora) >= diasLimite;
}

export function linkWhatsApp(telefone: string, texto?: string): string | null {
  // "(011) 9..." -> tira o 0 de longa distância antes do DDD.
  let numero = telefone.replace(/\D/g, "").replace(/^0+/, "");
  if (numero.length === 10 || numero.length === 11) numero = "55" + numero;
  if (numero.length < 12 || numero.length > 13) return null;
  return `https://wa.me/${numero}` + (texto ? `?text=${encodeURIComponent(texto)}` : "");
}

export function validarMudancaEtapa(
  destino: Etapa,
  extras: { valorVendido?: number; motivoPerda?: string },
): string | null {
  if (destino === "vendido" && !(extras.valorVendido && extras.valorVendido > 0)) return "Informe o valor vendido";
  if (destino === "perdido" && !extras.motivoPerda?.trim()) return "Informe o motivo da perda";
  return null;
}
