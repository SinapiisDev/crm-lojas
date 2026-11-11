import { expect, test } from "@playwright/test";
import { admin, criarUsuario, entrar, linkDoEmail, lojas, SENHA, sufixo } from "./ajuda";

test("convite por e-mail: criar senha, sair e entrar de novo", async ({ page }) => {
  const { loja1 } = await lojas();
  const email = `convidada-${sufixo()}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja1, cargo: "vendedor" });
  await admin.auth.admin.inviteUserByEmail(email, { data: { nome: "Convidada" } });

  await page.goto(await linkDoEmail(email));
  await expect(page).toHaveURL(/definir-senha/);
  await page.getByLabel("Nova senha").fill(SENHA);
  await page.getByLabel("Repita a senha").fill(SENHA);
  await page.getByRole("button", { name: "Salvar e entrar" }).click();
  await expect(page).toHaveURL(/\/leads/);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await entrar(page, email);
});

test("senha errada mostra aviso", async ({ page }) => {
  const { loja1 } = await lojas();
  const u = await criarUsuario("Errada", [[loja1, "vendedor"]]);
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(u.email);
  await page.getByLabel("Senha", { exact: true }).fill("outra-senha-1");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("login: botão mostra e oculta a senha; sem Google", async ({ page }) => {
  await page.goto("/login");
  const senha = page.getByLabel("Senha", { exact: true });
  await senha.fill("minha-senha");
  await expect(senha).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(senha).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senha" }).click();
  await expect(senha).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
});

test("dona convida pela tela de equipe; vendedora não vê o formulário", async ({ page }) => {
  const { loja1, loja2 } = await lojas();
  const dona = await criarUsuario("Dona", [[loja1, "dono"], [loja2, "dono"]]);
  await entrar(page, dona.email);
  await page.goto("/equipe");
  await page.getByLabel("Nome").fill("Nova Vendedora");
  const email = `nova-${sufixo()}@teste.local`;
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByRole("status")).toContainText(`Convite enviado para ${email}`);
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.getByLabel("Nome").fill("De Novo");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText("Essa pessoa já faz parte desta loja.")).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  const vendedora = await criarUsuario("Vend", [[loja1, "vendedor"]]);
  await entrar(page, vendedora.email);
  await page.goto("/equipe");
  await expect(page.getByRole("heading", { name: /Equipe/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Convidar" })).toHaveCount(0);
});

test("dona troca de loja no seletor", async ({ page }) => {
  const { loja1, loja2 } = await lojas();
  const dona = await criarUsuario("Dona2", [[loja1, "dono"], [loja2, "dono"]]);
  await entrar(page, dona.email);
  await page.goto("/equipe");
  await expect(page.getByRole("heading", { name: "Equipe · Loja 1" })).toBeVisible();
  await page.getByRole("combobox", { name: "Loja" }).selectOption({ label: "Loja 2" });
  await expect(page.getByRole("heading", { name: "Equipe · Loja 2" })).toBeVisible();
});
