import { describe, expect, test } from "vitest";
import { promptLead, type DadosLead } from "./leads";

const base: DadosLead = {
  nome: "Paulo Henrique",
  etapa: "negociacao",
  origem: "instagram",
  valor_estimado: 15000,
  ultimo_contato_em: "2026-11-08T15:00:00Z",
  vendedora: "Ana Souza",
  eventos: [],
};

describe("promptLead", () => {
  test("leva a conversa do WhatsApp, da mais antiga para a mais nova, marcando quem falou", () => {
    const p = promptLead(
      {
        ...base,
        mensagens: [
          { de_cliente: false, texto: "Consigo em 10x", enviada_em: "2026-11-09T14:00:00Z" },
          { de_cliente: true, texto: "Tem o sofá cinza?", enviada_em: "2026-11-09T13:00:00Z" },
          { de_cliente: true, texto: null, enviada_em: "2026-11-09T14:05:00Z" },
        ],
      },
      new Date("2026-11-10T12:00:00Z"),
    );
    expect(p).toContain("WhatsApp (mais antiga primeiro):");
    expect(p.indexOf("Cliente: Tem o sofá cinza?")).toBeLessThan(p.indexOf("Loja: Consigo em 10x"));
    expect(p).toContain("Cliente: [mídia]");
  });

  test("sem mensagens não cria a seção", () => {
    expect(promptLead(base)).not.toContain("WhatsApp (");
  });
});
