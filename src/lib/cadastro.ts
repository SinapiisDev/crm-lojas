import type { SupabaseClient } from "@supabase/supabase-js";

export type DadosCadastro = { nome: string; empresa: string; loja: string; email: string; senha: string; confirmar: string };

export function lerCadastro(form: FormData): DadosCadastro {
  const campo = (k: string) => String(form.get(k) ?? "").trim();
  return { nome: campo("nome"), empresa: campo("empresa"), loja: campo("loja"), email: campo("email").toLowerCase(), senha: String(form.get("senha") ?? ""), confirmar: String(form.get("confirmar") ?? "") };
}

export function validarCadastro(d: DadosCadastro): string | null {
  if (!d.nome || !d.empresa || !d.loja) return "Preencha seu nome, o nome da empresa e o da loja.";
  if ([d.nome, d.empresa, d.loja].some((s) => s.length > 120)) return "Nomes com até 120 caracteres.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "E-mail inválido.";
  if (d.senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (d.senha !== d.confirmar) return "As senhas não são iguais.";
  return null;
}

// Cria empresa, primeira loja e conta de dono. O gatilho ao_criar_usuario transforma o convite em membro,
// então a regra "sem convite ninguém cria conta" continua valendo para quem tenta pela API direto.
// shortcut: e-mail não é confirmado (SMTP ainda não configurado); quando houver, trocar por signUp com confirmação.
export async function criarEmpresa(admin: SupabaseClient, d: DadosCadastro): Promise<{ erro: string } | { usuarioId: string }> {
  const { data: existe } = await admin.from("perfis").select("id").eq("email", d.email).maybeSingle();
  if (existe) return { erro: "Este e-mail já tem conta. Entre ou use “Esqueci a senha”." };

  const { data: empresa, error: e1 } = await admin.from("empresas").insert({ nome: d.empresa }).select("id").single();
  if (e1) return { erro: "Não foi possível criar a empresa." };
  // Qualquer falha daqui em diante apaga a empresa (cascata leva loja e convite).
  const desfazer = async (erro: string) => {
    await admin.from("empresas").delete().eq("id", empresa.id);
    return { erro };
  };

  const { data: loja, error: e2 } = await admin.from("lojas").insert({ empresa_id: empresa.id, nome: d.loja }).select("id").single();
  if (e2) return desfazer("Não foi possível criar a loja.");
  const { error: e3 } = await admin.from("convites").insert({ email: d.email, loja_id: loja.id, cargo: "dono" });
  if (e3) return desfazer("Não foi possível criar a conta.");

  const { data: criado, error: e4 } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.senha,
    email_confirm: true,
    user_metadata: { nome: d.nome },
  });
  if (e4 || !criado.user) return desfazer(e4?.code === "email_exists" ? "Este e-mail já tem conta. Entre ou use “Esqueci a senha”." : "Não foi possível criar a conta.");
  return { usuarioId: criado.user.id };
}
