import { expect, test } from "@playwright/test";
import { hojeSP } from "../../src/lib/regras/tarefas";
import { admin, criarUsuario, entrar, lojaNova, sufixo } from "./ajuda";

test("rota da IA exige o segredo; com IA desligada não faz nada", async ({ request }) => {
  expect((await request.post("/api/ia/diaria", { maxRedirects: 0 })).status()).toBe(401);
  const certo = await request.post("/api/ia/diaria", {
    headers: { Authorization: `Bearer ${process.env.AVISOS_SEGREDO}` },
    maxRedirects: 0,
  });
  expect(certo.status()).toBe(200);
  expect(await certo.json()).toEqual({ leads: 0, resumos: 0 });
});

test("lead analisado mostra temperatura, resumo e WhatsApp com a sugestão", async ({ page }) => {
  const loja = await lojaNova("IA");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  const sugestao = "Oi Paulo! Consegui o parcelamento em 10x, quer que eu reserve?";
  const { data } = await admin
    .from("leads")
    .insert({
      loja_id: loja.id, vendedor_id: v.id, nome: `Paulo ${sufixo()}`, telefone: "11988887777", etapa: "negociacao",
      temperatura: "quente", resumo_ia: "Quer parcelar; pediu retorno até sexta.", sugestao_ia: sugestao,
      ia_em: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id, nome")
    .single();

  await entrar(page, v.email);
  const card = page.getByRole("region", { name: "Negociação" }).getByRole("link", { name: new RegExp(data!.nome) });
  await expect(card.getByText("Quente")).toBeVisible();

  await page.goto(`/leads/${data!.id}`);
  await expect(page.getByRole("region", { name: "Conversa até agora" }).getByText("Quer parcelar; pediu retorno até sexta.")).toBeVisible();
  const caixa = page.getByRole("region", { name: "Sugestão da IA" });
  await expect(caixa.getByText(sugestao)).toBeVisible();
  await expect(caixa.getByRole("link", { name: "Enviar sugestão no WhatsApp" })).toHaveAttribute(
    "href",
    `https://wa.me/5511988887777?text=${encodeURIComponent(sugestao)}`,
  );
});

test("sem análise da IA a caixa não aparece", async ({ page }) => {
  const loja = await lojaNova("SemIA");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  const { data } = await admin.from("leads").insert({ loja_id: loja.id, vendedor_id: v.id, nome: `Sem ${sufixo()}` }).select("id, nome").single();
  await entrar(page, v.email, undefined, `/leads/${data!.id}`);
  await expect(page.getByText(data!.nome)).toBeVisible();
  await expect(page.getByRole("region", { name: "Sugestão da IA" })).toHaveCount(0);
});

test("painel mostra o resumo da semana quando existe", async ({ page }) => {
  const loja = await lojaNova("Resumo");
  const dona = await criarUsuario(`Dona ${sufixo()}`, [[loja.id, "dono"]]);
  await entrar(page, dona.email, undefined, "/painel");
  await expect(page.getByRole("region", { name: "Resumo da semana" })).toHaveCount(0);
  await admin.from("resumos_semanais").insert({ loja_id: loja.id, semana_inicio: hojeSP(), texto: "Semana forte: 7 vendas." });
  await page.reload();
  await expect(page.getByRole("region", { name: "Resumo da semana" }).getByText("Semana forte: 7 vendas.")).toBeVisible();
});

test("sugestão feita antes do último contato não aparece (já foi usada)", async ({ page }) => {
  const loja = await lojaNova("Velha");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  const { data } = await admin
    .from("leads")
    .insert({
      loja_id: loja.id, vendedor_id: v.id, nome: `Velha ${sufixo()}`, telefone: "11988887777", etapa: "negociacao",
      sugestao_ia: "Oi! Mensagem antiga.", ia_em: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    })
    .select("id, nome")
    .single();
  await entrar(page, v.email, undefined, `/leads/${data!.id}`);
  await expect(page.getByText(data!.nome)).toBeVisible();
  await expect(page.getByRole("region", { name: "Sugestão da IA" })).toHaveCount(0);
});

test("lead vendido não mostra sugestão nem temperatura", async ({ page }) => {
  const loja = await lojaNova("Vendido");
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);
  const { data } = await admin
    .from("leads")
    .insert({
      loja_id: loja.id, vendedor_id: v.id, nome: `Fechado ${sufixo()}`, telefone: "11988887777", etapa: "vendido", valor_vendido: 100,
      temperatura: "quente", sugestao_ia: "Oi! Vamos retomar?", ia_em: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id, nome")
    .single();
  await entrar(page, v.email);
  const card = page.getByRole("region", { name: "Vendido" }).getByRole("link", { name: new RegExp(data!.nome) });
  await expect(card).toBeVisible();
  await expect(card.getByText("Quente")).toHaveCount(0);
  await page.goto(`/leads/${data!.id}`);
  await expect(page.getByRole("region", { name: "Sugestão da IA" })).toHaveCount(0);
});

test("assistente: só gerência vê; com IA desligada avisa", async ({ page, browser }) => {
  const loja = await lojaNova("Assist");
  const g = await criarUsuario(`Ger ${sufixo()}`, [[loja.id, "gerente"]]);
  const v = await criarUsuario(`Vend ${sufixo()}`, [[loja.id, "vendedor"]]);

  await entrar(page, g.email);
  await page.getByRole("link", { name: "Assistente" }).first().click();
  await expect(page.getByRole("heading", { name: "Assistente" })).toBeVisible();
  await expect(page.getByText("A IA está desligada.")).toBeVisible();

  const vendedora = await (await browser.newContext()).newPage();
  await entrar(vendedora, v.email);
  await expect(vendedora.getByRole("link", { name: "Assistente" })).toHaveCount(0);
  const r = await vendedora.goto("/assistente");
  expect(r?.status()).toBe(404);
});
