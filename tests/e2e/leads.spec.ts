import { expect, test, type Page } from "@playwright/test";
import { linkWhatsApp } from "../../src/lib/regras/leads";
import { admin, criarUsuario, entrar, lojas, sufixo } from "./ajuda";

const coluna = (page: Page, titulo: string) => page.getByRole("region", { name: titulo });

async function leadNoBanco(loja_id: string, vendedor_id: string, extra: Record<string, unknown> = {}) {
  const nome = String(extra.nome ?? `Cliente ${sufixo()}`);
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
  await page.getByLabel("Nome", { exact: true }).fill(nome);
  await page.getByLabel("Telefone", { exact: true }).fill("(11) 97777-6666");
  await page.getByLabel("Origem", { exact: true }).selectOption({ label: "Instagram" });
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
  await page.getByRole("region", { name: "Histórico" }).locator("summary").click(); // histórico começa fechado
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
  await expect(page.getByRole("region", { name: "Conversa até agora" }).getByText("Achou caro, vai ver com a esposa")).toBeVisible();
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
  await page.getByRole("region", { name: "Histórico" }).locator("summary").click(); // histórico começa fechado
  await expect(page.getByText("Abriu o WhatsApp")).toBeVisible();
});

test("vendedora não abre lead da colega pela URL", async ({ page }) => {
  const { loja1 } = await lojas();
  const a = await criarUsuario("VendA", [[loja1, "vendedor"]]);
  const b = await criarUsuario("VendB", [[loja1, "vendedor"]]);
  const daColega = await leadNoBanco(loja1, b.id);
  await entrar(page, a.email);
  await expect(coluna(page, "Novo").getByText(daColega.nome)).toHaveCount(0);
  const resposta = await page.goto(`/leads/${daColega.id}`);
  expect(resposta?.status()).toBe(404);
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

test("vendedora marca a temperatura; o card mostra e a escolha fica salva", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("Temperatura", [[loja1, "vendedor"]]);
  const lead = await leadNoBanco(loja1, v.id, { etapa: "em_contato" });
  await entrar(page, v.email, undefined, `/leads/${lead.id}`);
  const temperatura = page.getByRole("group", { name: "Temperatura" });
  await temperatura.getByRole("button", { name: "Quente" }).click();
  await expect(temperatura.getByRole("button", { name: "Quente" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Marcada por você")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("group", { name: "Temperatura" }).getByRole("button", { name: "Quente" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/leads");
  await expect(coluna(page, "Em contato").getByRole("link", { name: new RegExp(lead.nome) }).getByText("Quente")).toBeVisible();
});

test("abas Clientes/Parceiros, busca sem acento e visão em lista", async ({ page }) => {
  const { loja1 } = await lojas();
  const v = await criarUsuario("VendAbas", [[loja1, "vendedor"]]);
  const cliente = await leadNoBanco(loja1, v.id);
  const s = sufixo();
  const parceiro = await leadNoBanco(loja1, v.id, { nome: `Arquiteta Simões ${s}`, tipo: "parceiro", telefone: "42 99876-1234" });
  await entrar(page, v.email);

  await expect(coluna(page, "Novo").getByText(cliente.nome)).toBeVisible();
  await expect(page.getByText(parceiro.nome)).toHaveCount(0);

  await page.getByRole("tab", { name: /Parceiros/ }).click();
  await expect(coluna(page, "Novo").getByText(parceiro.nome)).toBeVisible();
  await expect(page.getByText(cliente.nome)).toHaveCount(0);

  await page.getByLabel("Buscar por nome ou telefone").fill(`simoes ${s}`);
  await expect(page.getByText("1 lead encontrado.")).toBeVisible();
  await page.getByLabel("Buscar por nome ou telefone").fill("1234");
  await expect(page.getByText(parceiro.nome)).toBeVisible();

  await page.getByRole("button", { name: "Ver em lista" }).click();
  await expect(page.getByRole("row", { name: new RegExp(parceiro.nome) })).toContainText("(42) 99876-1234");

  // Lead novo criado na aba Parceiros já nasce parceiro.
  await page.getByRole("button", { name: "Novo lead" }).click();
  await expect(page.getByLabel("Tipo", { exact: true })).toHaveValue("parceiro");
});

test.describe("abrir WhatsApp pelo aviso", () => {
  const abrir = (page: Page, id: string) => page.request.get(`/leads/${id}/whatsapp`, { maxRedirects: 0 });

  test("redireciona para o WhatsApp com a sugestão da IA", async ({ page }) => {
    const { loja1 } = await lojas();
    const dona = await criarUsuario("Dona", [[loja1, "dono"]]);
    const sugestao = 'Oi "Ana", tudo bem? 😊';
    const lead = await leadNoBanco(loja1, dona.id, { telefone: "42999143583" });
    await admin.from("leads").update({ sugestao_ia: sugestao, ia_em: new Date().toISOString() }).eq("id", lead.id);
    await entrar(page, dona.email);
    const r = await abrir(page, lead.id);
    expect(r.status()).toBe(307);
    expect(r.headers()["location"]).toBe(linkWhatsApp("42999143583", sugestao));
  });

  test("sugestão velha ou lead fechado abre o WhatsApp sem texto", async ({ page }) => {
    const { loja1 } = await lojas();
    const dona = await criarUsuario("Dona", [[loja1, "dono"]]);
    const velha = await leadNoBanco(loja1, dona.id, { telefone: "42999143583" });
    await admin.from("leads").update({ sugestao_ia: "Oi!", ia_em: "2020-01-01T00:00:00Z" }).eq("id", velha.id);
    const vendido = await leadNoBanco(loja1, dona.id, { telefone: "42999143583", etapa: "vendido", valor_vendido: 1000 });
    await admin.from("leads").update({ sugestao_ia: "Oi!", ia_em: new Date().toISOString() }).eq("id", vendido.id);
    await entrar(page, dona.email);
    for (const lead of [velha, vendido]) {
      expect((await abrir(page, lead.id)).headers()["location"]).toBe(linkWhatsApp("42999143583"));
    }
  });

  test("telefone inválido cai na página do lead", async ({ page }) => {
    const { loja1 } = await lojas();
    const dona = await criarUsuario("Dona", [[loja1, "dono"]]);
    const lead = await leadNoBanco(loja1, dona.id, { telefone: "123" });
    await entrar(page, dona.email);
    expect((await abrir(page, lead.id)).headers()["location"]).toMatch(new RegExp(`/leads/${lead.id}$`));
  });

  test("vendedora não abre o WhatsApp de lead da colega", async ({ page }) => {
    const { loja1 } = await lojas();
    const a = await criarUsuario("VendA", [[loja1, "vendedor"]]);
    const b = await criarUsuario("VendB", [[loja1, "vendedor"]]);
    const lead = await leadNoBanco(loja1, b.id, { telefone: "42999143583" });
    await entrar(page, a.email);
    const destino = (await abrir(page, lead.id)).headers()["location"];
    expect(destino).toMatch(/\/leads$/);
    expect(destino).not.toContain("999143583");
  });
});

test("\"Já mandei\" no aviso registra o contato e tira o lead dos parados", async ({ page }) => {
  const { loja1 } = await lojas();
  const dona = await criarUsuario("Dona", [[loja1, "dono"]]);
  const tresDias = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const lead = await leadNoBanco(loja1, dona.id, { telefone: "42999143583", etapa: "negociacao", ultimo_contato_em: tresDias });
  await admin.from("notificacoes").insert({
    usuario_id: dona.id, loja_id: loja1, titulo: `Lead parado: ${lead.nome}`, texto: "Sem contato há 3 dias.", link: `/leads/${lead.id}/whatsapp`,
  });
  await entrar(page, dona.email, undefined, "/avisos");
  const item = page.getByRole("listitem").filter({ hasText: lead.nome });
  await item.getByRole("button", { name: "Já mandei" }).click();
  await expect(item.getByText("Contato registrado")).toBeVisible();

  const { data } = await admin.from("leads").select("ultimo_contato_em").eq("id", lead.id).single();
  expect(Date.parse(data!.ultimo_contato_em)).toBeGreaterThan(Date.parse(tresDias) + 86_400_000);
  const { data: eventos } = await admin.from("lead_eventos").select("tipo").eq("lead_id", lead.id).eq("tipo", "whatsapp");
  expect(eventos).toHaveLength(1);

  // Voltando à lista, o aviso já aparece como resolvido.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: lead.nome }).getByText("Contato registrado")).toBeVisible();
});
