import { expect, test } from "@playwright/test";

test("/api/saude exige o segredo e toca o banco", async ({ request }) => {
  expect((await request.get("/api/saude", { maxRedirects: 0 })).status()).toBe(401);
  const r = await request.get("/api/saude", { headers: { Authorization: `Bearer ${process.env.AVISOS_SEGREDO}` }, maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ ok: true, banco: true });
});
