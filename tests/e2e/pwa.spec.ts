import { expect, test } from "@playwright/test";
import { criarUsuario, entrar, lojas, sufixo } from "./ajuda";

test("manifest válido com ícones", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  const m = await r.json();
  expect(m).toMatchObject({ name: "CRM Lojas", short_name: "CRM", display: "standalone", start_url: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});

test("sw.js servido sem cache e trata push", async ({ request }) => {
  const r = await request.get("/sw.js", { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toContain("no-cache");
  expect(r.headers()["content-type"]).toContain("javascript");
  expect(await r.text()).toContain("addEventListener(\"push\"");
});

test("ícone 192 é PNG e tamanho inválido é 404", async ({ request }) => {
  const r = await request.get("/icones/192", { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toBe("image/png");
  expect((await request.get("/icones/999", { maxRedirects: 0 })).status()).toBe(404);
});

test("página de avisos mostra o botão de ativar", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`Push ${sufixo()}`, [[loja1, "vendedor"]]);
  await entrar(page, v.email, undefined, "/avisos");
  await expect(page.getByRole("button", { name: "Ativar notificações neste aparelho" })).toBeVisible();
});
