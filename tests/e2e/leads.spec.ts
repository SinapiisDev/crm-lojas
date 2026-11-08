import { expect, test, type Page } from "@playwright/test";
import { admin, criarUsuario, entrar, lojas, sufixo } from "./ajuda";

const coluna = (page: Page, titulo: string) => page.getByRole("region", { name: titulo });

async function leadNoBanco(loja_id: string, vendedor_id: string, extra: Record<string, unknown> = {}) {
  const nome = `Cliente ${sufixo()}`;
  const { data, error } = await admin
    .from("leads")
    .insert({ loja_id, vendedor_id, nome, telefone: "(11) 98888-7777", origem: "instagram", ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, nome };
}

test("vendedora cria lead e ele aparece em Novo", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Vendedora", [[loja1, "vendedor"]]);
  await entrar(page, v.email);
  const nome = `Paulo ${sufixo()}`;
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel("Nome").fill(nome);
  await page.getByLabel("Telefone").fill("(11) 97777-6666");
  await page.getByLabel("Origem").selectOption({ label: "Instagram" });
  await page.getByLabel("Valor estimado").fill("12000");
  await page.getByRole("button", { name: "Salvar lead" }).click();
  await expect(coluna(page, "Novo").getByText(nome)).toBeVisible();
});

test("mudar para Vendido pede valor; cancelar não muda nada", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Vend", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id, { etapa: "negociacao" });
  await entrar(page, v.email);
  await page.goto(`/leads/${lead.id}`);

  await page.getByLabel("Etapa").selectOption({ label: "Vendido" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByLabel("Etapa")).toHaveValue("negociacao");

  await page.getByLabel("Etapa").selectOption({ label: "Vendido" });
  await page.getByLabel("Valor vendido").fill("15000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByLabel("Etapa")).toHaveValue("vendido");
  await expect(page.getByText(/Vendido.*R\$\s?15\.000,00/)).toBeVisible();
});

test("arrastar card entre colunas", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Arrasta", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id);
  await entrar(page, v.email);
  const card = coluna(page, "Novo").getByText(lead.nome);
  const destino = coluna(page, "Em contato");
  const a = (await card.boundingBox())!;
  const b = (await destino.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(destino.getByText(lead.nome)).toBeVisible();
  // A tela muda na hora; espera o servidor gravar antes de recarregar.
  await expect
    .poll(async () => (await admin.from("leads").select("etapa").eq("id", lead.id).single()).data?.etapa)
    .toBe("em_contato");
  await page.reload();
  await expect(coluna(page, "Em contato").getByText(lead.nome)).toBeVisible();
});

test("lead sem contato há 3 dias em negociação aparece como parado", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Parado", [[loja1, "vendedor"]]);
  const tresDias = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const lead = await leadNoBanco(loja1, v.id, { etapa: "negociacao", ultimo_contato_em: tresDias });
  await entrar(page, v.email);
  const card = coluna(page, "Negociação").getByRole("link", { name: new RegExp(lead.nome) });
  await expect(card.getByText("Parado")).toBeVisible();
  await expect(card.getByText("há 3 dias sem contato")).toBeVisible();
});

test("registrar contato entra no histórico e zera o contador", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Contato", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id, {
    etapa: "negociacao",
    ultimo_contato_em: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  });
  await entrar(page, v.email);
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole("button", { name: "Registrar contato" }).click();
  await expect(page.getByText("Escreva o que foi conversado.")).toBeVisible();
  await page.getByLabel("O que foi conversado?").fill("Achou caro, vai ver com a esposa");
  await page.getByRole("button", { name: "Registrar contato" }).click();
  await expect(page.getByText("Achou caro, vai ver com a esposa")).toBeVisible();
  await page.goto("/leads");
  await expect(coluna(page, "Negociação").getByText("contato hoje")).toBeVisible();
});

test("botão WhatsApp aponta para wa.me com DDI e registra contato", async ({ page, context }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Zap", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id);
  await entrar(page, v.email);
  await page.goto(`/leads/${lead.id}`);
  const zap = page.getByRole("link", { name: "WhatsApp" });
  await expect(zap).toHaveAttribute("href", /^https:\/\/wa\.me\/5511988887777/);
  const popup = context.waitForEvent("page");
  await zap.click();
  await (await popup).close();
  await expect(page.getByText("Abriu o WhatsApp")).toBeVisible();
});

test("vendedora não abre lead da colega pela URL", async ({ page }) => {
  const { loja1 } = await lojas();
  const a = await criarUsuario("VendA", [[loja1, "vendedor"]]);
  const b = await criarUsuario("VendB", [[loja1, "vendedor"]]);
  const daColega = await leadNoBanco(loja1, b.id);
  await entrar(page, a.email);
  await expect(coluna(page, "Novo").getByText(daColega.nome)).toHaveCount(0);
  await page.goto(`/leads/${daColega.id}`);
  await expect(page.getByText("Lead não encontrado")).toBeVisible();
  await expect(page.getByText(daColega.nome)).toHaveCount(0);
});

test("gerente vê leads da equipe com o nome da vendedora", async ({ page }) => {
  const { loja1 } = await lojas();
  const g = await criarUsuario("Gerente", [[loja1, "gerente"]]);
  const v = await criarUsuario("Carla", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id);
  await entrar(page, g.email);
  const card = coluna(page, "Novo").getByRole("link", { name: new RegExp(lead.nome) });
  await expect(card.getByText("Carla")).toBeVisible();
});

test("dona vê o kanban atualizar sozinho quando a vendedora move um lead", async ({ page, browser }) => {
  const { loja1 } = await lojas();
  const dona = await criarUsuario("DonaAoVivo", [[loja1, "dono"]]);
  const v = await criarUsuario("VendAoVivo", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id);
  await entrar(page, dona.email);
  await expect(coluna(page, "Novo").getByText(lead.nome)).toBeVisible();

  const outra = await (await browser.newContext()).newPage();
  await entrar(outra, v.email);
  await outra.goto(`/leads/${lead.id}`);
  await outra.getByLabel("Etapa").selectOption({ label: "Em contato" });
  await expect(outra.getByLabel("Etapa")).toHaveValue("em_contato");

  await expect(coluna(page, "Em contato").getByText(lead.nome)).toBeVisible({ timeout: 15_000 });
});

test("conferente não vê leads", async ({ page }) => {
  const { loja1 } = await lojas();
  const c = await criarUsuario("Conf", [[loja1, "conferente"]]);
  await entrar(page, c.email);
  await expect(page.getByText("Seu cargo não acompanha leads.")).toBeVisible();
});
