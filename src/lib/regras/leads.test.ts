import { describe, expect, test } from "vitest";
import { ETAPAS, diasSemContato, leadParado, linkWhatsApp, validarMudancaEtapa } from "./leads";

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
  test("negociação com contato há 2 dias e limite 2 está parado", () => {
    expect(leadParado({ etapa: "negociacao", ultimo_contato_em: haDias(2) }, 2, agora)).toBe(true);
  });
  test("orçamento enviado há 1 dia não está parado", () => {
    expect(leadParado({ etapa: "orcamento_enviado", ultimo_contato_em: haDias(1) }, 2, agora)).toBe(false);
  });
  test("lead novo nunca conta como parado", () => {
    expect(leadParado({ etapa: "novo", ultimo_contato_em: haDias(10) }, 2, agora)).toBe(false);
  });
  test("lead vendido nunca conta como parado", () => {
    expect(leadParado({ etapa: "vendido", ultimo_contato_em: haDias(10) }, 2, agora)).toBe(false);
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
