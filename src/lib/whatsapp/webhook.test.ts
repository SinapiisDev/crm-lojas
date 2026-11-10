import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { assinaturaValida, extrairMensagens } from "./webhook";

const entrada = (field: string, value: object) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field, value }] }] });
const META = { display_phone_number: "554130000000", phone_number_id: "PN1" };

describe("extrairMensagens", () => {
  test("mensagem de texto do cliente", () => {
    const corpo = entrada("messages", {
      messaging_product: "whatsapp",
      metadata: META,
      contacts: [{ wa_id: "5511988887777", profile: { name: "Paulo" } }],
      messages: [{ from: "5511988887777", id: "wamid.A", timestamp: "1762780000", type: "text", text: { body: "Oi, tem o sofá cinza?" } }],
    });
    expect(extrairMensagens(corpo)).toEqual([
      { id: "wamid.A", numeroLoja: "PN1", contato: "5511988887777", deCliente: true, tipo: "text", texto: "Oi, tem o sofá cinza?", enviadaEm: new Date(1762780000 * 1000).toISOString() },
    ]);
  });

  test("mensagem que a loja mandou pelo celular (eco do app)", () => {
    const corpo = entrada("smb_message_echoes", {
      messaging_product: "whatsapp",
      metadata: META,
      message_echoes: [{ from: "554130000000", to: "5511988887777", id: "wamid.B", timestamp: "1762780100", type: "text", text: { body: "Tem sim!" } }],
    });
    expect(extrairMensagens(corpo)).toEqual([
      { id: "wamid.B", numeroLoja: "PN1", contato: "5511988887777", deCliente: false, tipo: "text", texto: "Tem sim!", enviadaEm: new Date(1762780100 * 1000).toISOString() },
    ]);
  });

  test("mídia usa a legenda ou o tipo como texto", () => {
    const corpo = entrada("messages", {
      metadata: META,
      messages: [
        { from: "5511988887777", id: "wamid.C", timestamp: "1762780200", type: "image", image: { caption: "esse aqui" } },
        { from: "5511988887777", id: "wamid.D", timestamp: "1762780300", type: "audio", audio: {} },
      ],
    });
    expect(extrairMensagens(corpo).map((m) => [m.tipo, m.texto])).toEqual([
      ["image", "esse aqui"],
      ["audio", null],
    ]);
  });

  test("corte do texto longo não parte emoji ao meio", () => {
    const longo = "a".repeat(3999) + "😀" + "b".repeat(50);
    const corpo = entrada("messages", { metadata: META, messages: [{ from: "5511988887777", id: "wamid.E", timestamp: "1762780400", type: "text", text: { body: longo } }] });
    const [m] = extrairMensagens(corpo);
    expect(Array.from(m.texto!)).toHaveLength(4000);
    expect(m.texto!.endsWith("😀")).toBe(true);
  });

  test("ignora status de entrega, campos desconhecidos e lixo", () => {
    expect(extrairMensagens(entrada("messages", { metadata: META, statuses: [{ id: "wamid.X", status: "read" }] }))).toEqual([]);
    expect(extrairMensagens(entrada("account_update", { event: "PARTNER_REMOVED" }))).toEqual([]);
    expect(extrairMensagens(null)).toEqual([]);
    expect(extrairMensagens({ entry: "x" })).toEqual([]);
    expect(extrairMensagens(entrada("messages", { metadata: META, messages: [{ id: "sem-from" }] }))).toEqual([]);
  });
});

describe("assinaturaValida", () => {
  const corpo = '{"a":1}';
  const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
  test("aceita a assinatura certa", () => expect(assinaturaValida(corpo, assinatura, "segredo")).toBe(true));
  test("recusa assinatura errada, ausente ou sem segredo configurado", () => {
    expect(assinaturaValida(corpo, assinatura, "outro")).toBe(false);
    expect(assinaturaValida(corpo, null, "segredo")).toBe(false);
    expect(assinaturaValida(corpo, "sha256=abc", "segredo")).toBe(false);
    expect(assinaturaValida(corpo, assinatura, "")).toBe(false);
  });
});
