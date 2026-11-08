import { expect, test } from "@playwright/test";

test("rota de despacho exige o segredo", async ({ request }) => {
  expect((await request.post("/api/avisos/despachar", { maxRedirects: 0 })).status()).toBe(401);
  const errado = await request.post("/api/avisos/despachar", { headers: { Authorization: "Bearer errado" }, maxRedirects: 0 });
  expect(errado.status()).toBe(401);
  const certo = await request.post("/api/avisos/despachar", {
    headers: { Authorization: `Bearer ${process.env.AVISOS_SEGREDO}` },
    maxRedirects: 0,
  });
  expect(certo.status()).toBe(200);
  expect(await certo.json()).toHaveProperty("push");
});
