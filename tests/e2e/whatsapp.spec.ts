import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { admin, criarUsuario, entrar, lojaNova, sufixo } from "./ajuda";

const SEGREDO = process.env.WHATSAPP_APP_SECRET!;
const assinar = (corpo: string) => "sha256=" + createHmac("sha256", SEGREDO).update(corpo).digest("hex");

test("webhook: Meta confere o endereço com o token certo", async ({ request }) => {
  const ok = await request.get(`/api/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=123`, { maxRedirects: 0 });
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("123");
  expect((await request.get("/api/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1", { maxRedirects: 0 })).status()).toBe(403);
});

test("webhook: sem assinatura válida recusa", async ({ request }) => {
  const r = await request.post("/api/whatsapp", { data: "{}", headers: { "x-hub-signature-256": "sha256=00" }, maxRedirects: 0 });
  expect(r.status()).toBe(401);
});

test("mensagem do cliente e resposta da loja aparecem na conversa do lead", async ({ page, request }) => {
  const loja = await lojaNova("WhatsApp");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  const numeroLoja = `PN-${sufixo()}`;
  await admin.from("whatsapp_numeros").insert({ phone_number_id: numeroLoja, loja_id: loja.id, numero: "+55 41 3000-0000" });
  const { data: lead } = await admin
    .from("leads")
    .insert({ loja_id: loja.id, vendedor_id: v.id, nome: `Cliente ${sufixo()}`, telefone: "(11) 97777-6666" })
    .select("id")
    .single();

  const agora = Math.floor(Date.now() / 1000);
  const corpo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: { metadata: { phone_number_id: numeroLoja }, messages: [{ from: "5511977776666", id: `wamid.${sufixo()}a`, timestamp: String(agora - 60), type: "text", text: { body: "Tem o sofá cinza?" } }] },
          },
          {
            field: "smb_message_echoes",
            value: { metadata: { phone_number_id: numeroLoja }, message_echoes: [{ from: "554130000000", to: "5511977776666", id: `wamid.${sufixo()}b`, timestamp: String(agora), type: "text", text: { body: "Tem sim! Passo o valor?" } }] },
          },
        ],
      },
    ],
  });
  const r = await request.post("/api/whatsapp", { data: corpo, headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) }, maxRedirects: 0 });
  expect(r.status()).toBe(200);
  // Reenvio da Meta (mesmo wamid) não duplica.
  await request.post("/api/whatsapp", { data: corpo, headers: { "content-type": "application/json", "x-hub-signature-256": assinar(corpo) }, maxRedirects: 0 });

  await entrar(page, v.email, undefined, `/leads/${lead!.id}`);
  const conversa = page.getByRole("region", { name: "WhatsApp" });
  await expect(conversa.getByText("Tem o sofá cinza?")).toHaveCount(1);
  await expect(conversa.getByText("Tem sim! Passo o valor?")).toHaveCount(1);
});
