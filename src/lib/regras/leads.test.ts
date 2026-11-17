import { describe, expect, test } from "vitest";
import { DIAS_PARCEIRO_PARADO, ETAPAS, diasSemContato, filtrarLeads, leadParado, linkWhatsApp, validarMudancaEtapa, type Etapa } from "./leads";

const agora = new Date("2026-11-10T12:00:00-03:00");
const haDias = (n: number) => new Date(agora.getTime() - n * 86_400_000).toISOString();

describe("ETAPAS", () => {
  test("seis etapas na ordem do kanban", () => {
    expect(ETAPAS.map((e) => e.titulo)).toEqual([
      "Novo",
      "Em contato",
      "Orçamento enviado",
      "Negociação",
      "Vendido",
      "Perdido",
    ]);
  });
});

describe("leadParado", () => {
  const cliente = (etapa: Etapa, dias: number) => ({ etapa, ultimo_contato_em: haDias(dias), tipo: "cliente" as const });
  const parceiro = (etapa: Etapa, dias: number) => ({ etapa, ultimo_contato_em: haDias(dias), tipo: "parceiro" as const });
  test("cliente em negociação há 2 dias com limite 2 está parado", () => {
    expect(leadParado(cliente("negociacao", 2), 2, agora)).toBe(true);
  });
  test("cliente novo há 2 dias também conta como parado", () => {
    expect(leadParado(cliente("novo", 2), 2, agora)).toBe(true);
  });
  test("cliente em contato há 1 dia não está parado", () => {
    expect(leadParado(cliente("em_contato", 1), 2, agora)).toBe(false);
  });
  test("parceiro usa 15 dias, não o prazo da loja", () => {
    expect(leadParado(parceiro("em_contato", 14), 2, agora)).toBe(false);
    expect(leadParado(parceiro("em_contato", DIAS_PARCEIRO_PARADO), 2, agora)).toBe(true);
  });
  test("vendido ou perdido nunca conta como parado", () => {
    for (const etapa of ["vendido", "perdido"] as const) {
      expect(leadParado(cliente(etapa, 30), 2, agora)).toBe(false);
      expect(leadParado(parceiro(etapa, 30), 2, agora)).toBe(false);
    }
  });
});

describe("diasSemContato", () => {
  test("conta dias inteiros", () => {
    expect(diasSemContato(haDias(3), agora)).toBe(3);
    expect(diasSemContato(new Date(agora.getTime() - 3600_000).toISOString(), agora)).toBe(0);
  });
});

describe("linkWhatsApp", () => {
  test("limpa máscara e adiciona 55", () => {
    expect(linkWhatsApp("(11) 98888-7777", "Oi")).toBe("https://wa.me/5511988887777?text=Oi");
  });
  test("aceita número já com +55", () => {
    expect(linkWhatsApp("+55 11 98888-7777")).toBe("https://wa.me/5511988887777");
  });
  test("codifica o texto", () => {
    expect(linkWhatsApp("11988887777", "Oi Paulo, tudo bem?")).toBe(
      "https://wa.me/5511988887777?text=Oi%20Paulo%2C%20tudo%20bem%3F",
    );
  });
  test("tira o 0 do DDD digitado como (011) (I3)", () => {
    expect(linkWhatsApp("(011) 98888-7777")).toBe("https://wa.me/5511988887777");
  });
  test("número curto demais é inválido", () => {
    expect(linkWhatsApp("123")).toBeNull();
  });
});

describe("validarMudancaEtapa", () => {
  test("vendido exige valor", () => {
    expect(validarMudancaEtapa("vendido", {})).toBe("Informe o valor vendido");
    expect(validarMudancaEtapa("vendido", { valorVendido: 0 })).toBe("Informe o valor vendido");
    expect(validarMudancaEtapa("vendido", { valorVendido: 1500 })).toBeNull();
  });
  test("perdido exige motivo", () => {
    expect(validarMudancaEtapa("perdido", { motivoPerda: " " })).toBe("Informe o motivo da perda");
    expect(validarMudancaEtapa("perdido", { motivoPerda: "Preço" })).toBeNull();
  });
  test("outras etapas não exigem nada", () => {
    expect(validarMudancaEtapa("negociacao", {})).toBeNull();
  });
});

describe("filtrarLeads", () => {
  const base = { telefone: "", temperatura: null, vendedor: "Ari", origem: "prospeccao" };
  const leads = [
    { ...base, nome: "Construtora Simões", telefone: "42999143583", tipo: "parceiro" as const, temperatura: "quente" },
    { ...base, nome: "Maria Kluge", telefone: "(42) 99804-5727", tipo: "cliente" as const, vendedor: "Thamilly", origem: "instagram" },
    { ...base, nome: "Arq. Renata", tipo: "parceiro" as const },
  ];
  const nomes = (f: Parameters<typeof filtrarLeads>[1]) => filtrarLeads(leads, f).map((l) => l.nome);

  test("separa por tipo e busca sem acento ou por pedaço do telefone", () => {
    expect(nomes({ tipo: "parceiro" })).toEqual(["Construtora Simões", "Arq. Renata"]);
    expect(nomes({ tipo: "parceiro", busca: "simoes" })).toEqual(["Construtora Simões"]);
    expect(nomes({ tipo: "cliente", busca: "9980" })).toEqual(["Maria Kluge"]);
    expect(nomes({ tipo: "cliente", busca: "kluge 2" })).toEqual([]);
  });

  test("filtra por temperatura (inclusive sem temperatura), responsável e origem", () => {
    expect(nomes({ tipo: "parceiro", temperatura: "quente" })).toEqual(["Construtora Simões"]);
    expect(nomes({ tipo: "parceiro", temperatura: "sem" })).toEqual(["Arq. Renata"]);
    expect(nomes({ tipo: "cliente", vendedor: "Ari" })).toEqual([]);
    expect(nomes({ tipo: "cliente", origem: "instagram" })).toEqual(["Maria Kluge"]);
  });
});
