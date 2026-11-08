export type StatusTarefa = "a_fazer" | "fazendo" | "feito";
export type Recorrencia = "diaria" | "semanal" | "mensal";
export type SituacaoPrazo = "feita" | "atrasada" | "hoje" | "amanha" | "ok";

export const STATUS_TAREFA: { id: StatusTarefa; titulo: string }[] = [
  { id: "a_fazer", titulo: "A fazer" },
  { id: "fazendo", titulo: "Fazendo" },
  { id: "feito", titulo: "Feito" },
];

export const RECORRENCIAS: { id: Recorrencia; titulo: string }[] = [
  { id: "diaria", titulo: "Todo dia" },
  { id: "semanal", titulo: "Toda semana" },
  { id: "mensal", titulo: "Todo mês" },
];

const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

// Data de hoje (YYYY-MM-DD) no fuso das lojas.
export function hojeSP(agora = new Date()): string {
  return diaSP.format(agora);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(ate + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / 86_400_000);
}

export function situacaoPrazo(prazo: string, status: StatusTarefa, hoje: string): SituacaoPrazo {
  if (status === "feito") return "feita";
  const dias = diasEntre(hoje, prazo);
  if (dias < 0) return "atrasada";
  if (dias === 0) return "hoje";
  return dias === 1 ? "amanha" : "ok";
}

const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export function textoPrazo(prazo: string, status: StatusTarefa, hoje: string): string {
  const situacao = situacaoPrazo(prazo, status, hoje);
  if (situacao === "feita") return "feita";
  if (situacao === "atrasada") {
    const dias = diasEntre(prazo, hoje);
    return dias === 1 ? "atrasada há 1 dia" : `atrasada há ${dias} dias`;
  }
  if (situacao === "hoje") return "vence hoje";
  if (situacao === "amanha") return "vence amanhã";
  return `vence ${ddmm(prazo)}`;
}

export function mensagemCobranca(nome: string, titulo: string, prazo: string, hoje: string): string {
  const atraso = diasEntre(prazo, hoje);
  const quando =
    atraso > 0 ? `venceu há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : atraso === 0 ? "vence hoje" : `vence em ${ddmm(prazo)}`;
  return `Oi ${nome.split(" ")[0]}, a tarefa "${titulo}" ${quando}. Me dá um retorno até hoje?`;
}
