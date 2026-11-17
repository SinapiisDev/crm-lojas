import type { Proposta, PropostaLead, PropostaMemoria } from "./assistente";

// Sem dependência de servidor: o chat (navegador) usa para pedir a remoção de uma proposta.
export type TipoProposta = "tarefa" | "lead" | "memoria";

// Identifica a proposta pelo conteúdo, não pela posição (a lista do navegador pode estar velha).
export function chaveProposta(tipo: TipoProposta, p: Proposta | PropostaLead | PropostaMemoria): string {
  if (tipo === "tarefa") {
    const t = p as Proposta;
    return [t.titulo, t.responsavel_id, t.loja_id, t.prazo].join("|");
  }
  if (tipo === "lead") {
    const l = p as PropostaLead;
    return [l.nome, l.vendedor_id, l.loja_id].join("|");
  }
  const m = p as PropostaMemoria;
  return [m.loja_id, m.texto].join("|");
}

