import { expect, test } from "@playwright/test";
import { hojeSP } from "../../src/lib/regras/tarefas";
import { admin, criarUsuario, entrar, lojaNova, sufixo } from "./ajuda";

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dia = (n: number) => {
  const d = new Date(hojeSP() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function leads(loja_id: string, vendedor_id: string, linhas: Record<string, unknown>[]) {
  const { error } = await admin
    .from("leads")
    .insert(linhas.map((l) => ({ loja_id, vendedor_id, nome: `L ${sufixo()}`, ...l })), { defaultToNull: false });
  if (error) throw error;
}

test("dona vê números do período por loja e total", async ({ page }) => {
  const a = await lojaNova("Painel A");
  const b = await lojaNova("Painel B");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[a.id, "dono"], [b.id, "dono"]]);
  const carla = await criarUsuario(`Carla ${sufixo()}`, [[a.id, "vendedor"]]);
  await leads(a.id, carla.id, [
    { criado_em: diasAtras(1) },
    { criado_em: diasAtras(2) },
    { criado_em: diasAtras(3), etapa: "vendido", valor_vendido: 1500 },
    { criado_em: diasAtras(20), etapa: "negociacao", ultimo_contato_em: diasAtras(5) },
  ]);
  await entrar(page, dona.email, undefined, "/painel");

  const linhaA = page.getByRole("row", { name: new RegExp(a.nome) });
  await expect(linhaA.getByRole("cell").nth(1)).toHaveText(/^3/);
  await expect(linhaA.getByRole("cell").nth(2)).toHaveText("1");
  await expect(linhaA.getByRole("cell").nth(3)).toHaveText("33%");
  await expect(linhaA.getByRole("cell").nth(4)).toHaveText(/R\$\s?1\.500,00/);
  await expect(linhaA.getByRole("cell").nth(5)).toHaveText("1");
  await expect(page.getByRole("row", { name: new RegExp(b.nome) }).getByRole("cell").nth(1)).toHaveText(/^0/);
  await expect(page.getByRole("row", { name: /Total/ }).getByRole("cell").nth(1)).toHaveText(/^3/);
  const vendas = page.getByRole("region", { name: "Vendas por vendedora" });
  await vendas.locator("summary").click(); // começa fechado
  await expect(vendas.getByText(carla.nome)).toBeVisible();

  await page.getByRole("link", { name: "Últimos 30 dias" }).click();
  await expect(linhaA.getByRole("cell").nth(1)).toHaveText(/^4/);
});

test("gerente vê só a loja que gere", async ({ page }) => {
  const a = await lojaNova("Gere A");
  const b = await lojaNova("Vende B");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[a.id, "gerente"], [b.id, "vendedor"]]);
  await entrar(page, g.email, undefined, "/painel");
  await expect(page.getByRole("row", { name: new RegExp(a.nome) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(b.nome) })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Todas as lojas" })).toHaveCount(0);

  await page.goto(`/painel?loja=${b.id}`);
  await expect(page.getByRole("row", { name: new RegExp(b.nome) })).toHaveCount(0);
});

test("vendedora não vê Painel e /painel é 404", async ({ page }) => {
  const a = await lojaNova("Sem painel");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[a.id, "vendedor"]]);
  await entrar(page, v.email);
  await expect(page).toHaveURL(/\/leads/);
  await expect(page.getByRole("link", { name: "Painel" })).toHaveCount(0);
  const r = await page.goto("/painel");
  expect(r?.status()).toBe(404);
});

test("cobrar tarefa atrasada pelo painel", async ({ page }) => {
  const a = await lojaNova("Cobra");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[a.id, "dono"]]);
  const bruno = await criarUsuario(`Bruno ${sufixo()}`, [[a.id, "vendedor"]]);
  const { data: t } = await admin
    .from("tarefas")
    .insert({ loja_id: a.id, responsavel_id: bruno.id, titulo: `Orçamento ${sufixo()}`, prazo: dia(-3) })
    .select("id, titulo")
    .single();
  await entrar(page, dona.email, undefined, "/painel");
  const bloco = page.getByRole("region", { name: "Tarefas atrasadas" });
  const linha = bloco.getByRole("row", { name: new RegExp(t!.titulo) });
  await expect(linha).toContainText("3 dias");
  await linha.getByRole("button", { name: "Cobrar" }).click();
  await page.getByRole("button", { name: "Enviar cobrança" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await admin.from("tarefa_eventos").select("tipo").eq("tarefa_id", t!.id).eq("tipo", "cobranca")).data?.length)
    .toBe(1);
});

test("dona cai no painel ao entrar", async ({ page }) => {
  const a = await lojaNova("Entrada");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[a.id, "dono"]]);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(dona.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-1234");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel/);
});

test("no painel só existe o filtro de loja do próprio painel", async ({ page }) => {
  const a = await lojaNova("Sel A");
  const b = await lojaNova("Sel B");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[a.id, "dono"], [b.id, "dono"]]);
  await entrar(page, dona.email, undefined, "/painel");
  await expect(page.getByRole("link", { name: "Todas as lojas" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Loja", exact: true })).toHaveCount(0);
  await page.goto("/leads");
  await expect(page.getByRole("combobox", { name: "Loja", exact: true })).toBeVisible();
});

test("painel: blocos em sanfona, os menos usados começam fechados", async ({ page }) => {
  const loja = await lojaNova("Sanfona");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[loja.id, "dono"]]);
  await entrar(page, dona.email, undefined, "/painel");
  const vendas = page.getByRole("region", { name: "Vendas por vendedora" });
  await expect(vendas.locator("details")).not.toHaveAttribute("open");
  await expect(page.getByRole("region", { name: "Tarefas atrasadas" }).locator("details")).toHaveAttribute("open", "");
  await vendas.locator("summary").click();
  await expect(vendas.locator("details")).toHaveAttribute("open", "");
});
