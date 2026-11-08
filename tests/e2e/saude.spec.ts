import { expect, test } from "@playwright/test";

test("/api/saude responde sem login e toca o banco", async ({ request }) => {
  const r = await request.get("/api/saude", { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ ok: true, banco: true });
});
