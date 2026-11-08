import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hojeSP } from "../../src/lib/regras/tarefas";
import { admin, criarUsuario, entrar, lojaNova, sufixo } from "./ajuda";

const coluna = (page: Page, nome: string) => page.getByRole("region", { name: nome });
const amanha = () => {
  const d = new Date(hojeSP() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function reuniaoNoBanco(loja_id: string, criador: string, participantes: string[], inicio: string, titulo = `Reunião ${sufixo()}`) {
  const { data, error } = await admin
    .from("reunioes")
    .insert({ loja_id, empresa_id: "00000000-0000-0000-0000-000000000001", titulo, inicio, criado_por: criador })
    .select("id")
    .single();
  if (error) throw error;
  await admin.from("reuniao_participantes").insert(participantes.map((usuario_id) => ({ reuniao_id: data.id, usuario_id })));
  return { id: data.id as string, titulo };
}

async function emailBruto(para: string, assunto: string) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}`);
    const m = ((await r.json()).messages ?? []).find((x: { Subject: string }) => x.Subject === assunto);
    if (m) return (await fetch(`http://127.0.0.1:54324/api/v1/message/${m.ID}/raw`)).text();
    await new Promise((ok) => setTimeout(ok, 300));
  }
  return "";
}

test("gerente marca reunião: aparece na coluna dos participantes e o convite chega por e-mail", async ({ page }) => {
  const loja = await lojaNova("Reun");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja.id, "gerente"]]);
  const v = await criarUsuario(`Ana ${sufixo()}`, [[loja.id, "vendedor"]]);
  await entrar(page, g.email, undefined, "/tarefas");
  const titulo = `Metas da semana ${sufixo()}`;
  await page.getByRole("button", { name: "Nova reunião" }).click();
  await page.getByLabel("Título").fill(titulo);
  await page.getByLabel("Data").fill(amanha());
  await page.getByLabel("Hora").fill("09:00");
  await page.getByLabel("Local ou link").fill("Loja");
  await page.getByRole("checkbox", { name: v.nome }).check();
  await page.getByRole("button", { name: "Marcar reunião" }).click();
  await expect(coluna(page, v.nome).getByText(titulo)).toBeVisible();
  await expect(coluna(page, g.nome).getByText(titulo)).toBeVisible();

  const bruto = await emailBruto(v.email, `Convite: ${titulo}`);
  expect(bruto).toContain("text/calendar");
  expect(bruto).toContain("method=REQUEST");
  expect(bruto.replace(/=\r?\n/g, "")).toContain("BEGIN:VCALENDAR");
});

test("participante registra ata e o painel mostra que aconteceu", async ({ page, browser }) => {
  const loja = await lojaNova("Ata");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja.id, "gerente"]]);
  const v = await criarUsuario(`Bia ${sufixo()}`, [[loja.id, "vendedor"]]);
  const r = await reuniaoNoBanco(loja.id, g.id, [g.id, v.id], new Date(Date.now() - 2 * 3_600_000).toISOString());

  await entrar(page, v.email, undefined, `/reunioes/${r.id}`);
  await page.getByLabel("Aconteceu", { exact: true }).check();
  await page.getByLabel("Ata").fill("Meta: 10 vendas na semana");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Meta: 10 vendas na semana")).toBeVisible();

  const dona = await (await browser.newContext()).newPage();
  await entrar(dona, g.email, undefined, "/painel");
  const bloco = dona.getByRole("region", { name: "Reuniões" });
  await expect(bloco.getByRole("row", { name: new RegExp(r.titulo) })).toContainText("aconteceu");
});

test("reunião passada sem registro aparece como 'sem registro' no painel", async ({ page }) => {
  const loja = await lojaNova("SemReg");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja.id, "gerente"]]);
  const r = await reuniaoNoBanco(loja.id, g.id, [g.id], new Date(Date.now() - 3 * 86_400_000).toISOString());
  await entrar(page, g.email, undefined, "/painel");
  await expect(page.getByRole("region", { name: "Reuniões" }).getByRole("row", { name: new RegExp(r.titulo) })).toContainText(
    "sem registro",
  );
});

test("feed da agenda: token certo traz a reunião, token errado 404", async ({ page, request }) => {
  const loja = await lojaNova("Feed");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja.id, "gerente"]]);
  const v = await criarUsuario(`Cris ${sufixo()}`, [[loja.id, "vendedor"]]);
  const r = await reuniaoNoBanco(loja.id, g.id, [g.id, v.id], new Date(Date.now() + 86_400_000).toISOString());
  await entrar(page, v.email, undefined, "/avisos");
  const endereco = await page.getByLabel("Endereço da agenda").inputValue();
  expect(endereco).toMatch(/\/agenda\/[0-9a-f-]{36}\.ics$/);

  const feed = await request.get(new URL(endereco).pathname);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  expect(await feed.text()).toContain(`UID:${r.id}@crm-lojas`);
  expect((await request.get(`/agenda/${randomUUID()}.ics`)).status()).toBe(404);
});

test("vendedora não vê 'Nova reunião'", async ({ page }) => {
  const loja = await lojaNova("SemBotao");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  await entrar(page, v.email, undefined, "/tarefas");
  await expect(page.getByRole("button", { name: "Nova tarefa" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova reunião" })).toHaveCount(0);
});
