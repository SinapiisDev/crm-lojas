import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
export const SENHA = "senha-e2e-1234";
export const sufixo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
type Cargo = "dono" | "gerente" | "vendedor" | "conferente";

export async function lojas() {
  const { data } = await admin.from("lojas").select("id, nome").order("nome");
  return { loja1: data!.find((l) => l.nome === "Loja 1")!.id, loja2: data!.find((l) => l.nome === "Loja 2")!.id };
}

export async function criarUsuario(nome: string, vinculos: [string, Cargo][]) {
  const email = `${nome.toLowerCase().replace(/\W/g, "")}-${sufixo()}@teste.local`;
  for (const [loja_id, cargo] of vinculos) await admin.from("convites").insert({ email, loja_id, cargo });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  return { id: data.user!.id, email, nome };
}

export async function linkDoEmail(email: string) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent("to:" + email)}`);
    const { messages } = await r.json();
    if (messages?.length) {
      const msg = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${messages[0].ID}`)).json();
      return /href="([^"]+)"/.exec(msg.HTML)![1].replaceAll("&amp;", "&");
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`e-mail para ${email} não chegou`);
}

export async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/leads/);
}
