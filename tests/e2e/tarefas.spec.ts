import { expect, test, type Page } from "@playwright/test";
import { hojeSP } from "../../src/lib/regras/tarefas";
import { admin, criarUsuario, entrar, lojas, sufixo } from "./ajuda";

const hoje = hojeSP();
const somarDias = (n: number) => {
  const d = new Date(hoje + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const coluna = (page: Page, nome: string) => page.getByRole("region", { name: nome });

async function tarefaNoBanco(loja_id: string, responsavel_id: string, extra: Record<string, unknown> = {}) {
  const titulo = `Tarefa ${sufixo()}`;
  const { data, error } = await admin
    .from("tarefas")
    .insert({ loja_id, responsavel_id, titulo, prazo: hoje, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, titulo };
}

test("gerente cria tarefa para vendedora e ela aparece na coluna dela", async ({ page }) => {
  const { loja1 } = await lojas();
  const g = await criarUsuario(`Gerente ${sufixo()}`, [[loja1, "gerente"]]);
  const v = await criarUsuario(`Bruna ${sufixo()}`, [[loja1, "vendedor"]]);
  await entrar(page, g.email);
  await page.goto("/tarefas");
  const titulo = `Conferir vitrine ${sufixo()}`;
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  await page.getByLabel("Título").fill(titulo);
  await page.getByLabel("Responsável").selectOption({ label: v.nome });
  await page.getByLabel("Prazo").fill(somarDias(3));
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await expect(coluna(page, v.nome).getByText(titulo)).toBeVisible();
  await expect(coluna(page, v.nome).getByText(`vence ${ddmm(somarDias(3))}`)).toBeVisible();
});

test("tarefa vencida aparece como atrasada", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, v.id, { prazo: somarDias(-1) });
  await entrar(page, v.email);
  await page.goto("/tarefas");
  const card = coluna(page, v.nome).getByRole("link", { name: new RegExp(t.titulo) });
  await expect(card.getByText("atrasada há 1 dia")).toBeVisible();
});

test("vendedora só pode criar tarefa para si", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`Sozinha ${sufixo()}`, [[loja1, "vendedor"]]);
  await entrar(page, v.email);
  await page.goto("/tarefas");
  await page.getByRole("button", { name: "Nova tarefa" }).click();
  await expect(page.getByLabel("Responsável")).toHaveCount(0);
  const titulo = `Minha ${sufixo()}`;
  await page.getByLabel("Título").fill(titulo);
  await page.getByLabel("Prazo").fill(hoje);
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await expect(coluna(page, v.nome).getByText(titulo)).toBeVisible();
});

test("esconder feitas", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`Feitas ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, v.id, { status: "feito" });
  await entrar(page, v.email);
  await page.goto("/tarefas");
  await expect(coluna(page, v.nome).getByText(t.titulo)).toBeVisible();
  await page.getByRole("link", { name: "Esconder feitas" }).click();
  await expect(coluna(page, v.nome).getByText(t.titulo)).toHaveCount(0);
});

test("fluxo completo: gerente cobra, vendedora pede novo prazo, gerente aprova", async ({ page, browser }) => {
  const { loja1 } = await lojas();
  const g = await criarUsuario(`Gerente ${sufixo()}`, [[loja1, "gerente"]]);
  const v = await criarUsuario(`Bruno ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, v.id, { prazo: somarDias(-3) });

  await entrar(page, g.email);
  await page.goto(`/tarefas/${t.id}`);
  await page.getByRole("button", { name: "Cobrar" }).click();
  const mensagem = page.getByLabel("Mensagem");
  await expect(mensagem).toHaveValue(`Oi Bruno, a tarefa "${t.titulo}" venceu há 3 dias. Me dá um retorno até hoje?`);
  await mensagem.fill("Bruno, preciso disso hoje.");
  await page.getByRole("button", { name: "Enviar cobrança" }).click();
  await page.getByRole("region", { name: "Histórico" }).locator("summary").click(); // histórico começa fechado
  await expect(page.getByText("Bruno, preciso disso hoje.")).toBeVisible();

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, v.email);
  await vendedora.goto(`/tarefas/${t.id}`);
  await vendedora.getByRole("region", { name: "Histórico" }).locator("summary").click();
  await expect(vendedora.getByText("Bruno, preciso disso hoje.")).toBeVisible();
  await vendedora.getByRole("button", { name: "Pedir novo prazo" }).click();
  await vendedora.getByLabel("Novo prazo", { exact: true }).fill(somarDias(2));
  await vendedora.getByLabel("Motivo").fill("Cliente pediu para esperar a medida da obra");
  await vendedora.getByRole("button", { name: "Enviar pedido" }).click();
  await expect(vendedora.getByText(`Prazo pedido: ${ddmm(somarDias(2))}`)).toBeVisible();

  await page.reload();
  await page.getByRole("region", { name: "Histórico" }).locator("summary").click();
  await expect(page.getByText("Cliente pediu para esperar a medida da obra")).toBeVisible();
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText(`Prazo: ${ddmm(somarDias(2))}`)).toBeVisible();
  await expect(page.getByText("Prazo alterado 1 vez")).toBeVisible();
});

test("vendedora não vê Cobrar", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`SemCobrar ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, v.id);
  await entrar(page, v.email);
  await page.goto(`/tarefas/${t.id}`);
  await expect(page.getByRole("heading", { name: t.titulo })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cobrar" })).toHaveCount(0);
});

test("sino mostra aviso não lido e zera ao abrir", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario(`Sino ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, v.id);
  await entrar(page, v.email);
  await expect(page.getByRole("link", { name: "Avisos: 1 não lido" })).toBeVisible();
  await page.getByRole("link", { name: /Avisos/ }).click();
  await expect(page.getByText(t.titulo)).toBeVisible();
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Avisos" })).toBeVisible();
});

test("tarefa de outra loja responde 404", async ({ page }) => {
  const { loja1, loja2 } = await lojas();
  const v = await criarUsuario(`L1 ${sufixo()}`, [[loja1, "vendedor"]]);
  const outra = await criarUsuario(`L2 ${sufixo()}`, [[loja2, "vendedor"]]);
  const t = await tarefaNoBanco(loja2, outra.id);
  await entrar(page, v.email);
  const resposta = await page.goto(`/tarefas/${t.id}`);
  expect(resposta?.status()).toBe(404);
  await expect(page.getByText(t.titulo)).toHaveCount(0);
});

test("tarefa de quem saiu da loja aparece em 'Saíram da loja'", async ({ page }) => {
  const { loja1 } = await lojas();
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja1, "gerente"]]);
  const saiu = await criarUsuario(`Saiu ${sufixo()}`, [[loja1, "vendedor"]]);
  const t = await tarefaNoBanco(loja1, saiu.id);
  await admin.from("membros").delete().eq("usuario_id", saiu.id).eq("loja_id", loja1);
  await entrar(page, g.email);
  await page.goto("/tarefas");
  await expect(coluna(page, "Saíram da loja").getByText(t.titulo)).toBeVisible();
});
