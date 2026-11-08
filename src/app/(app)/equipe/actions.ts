"use server";

import { revalidatePath } from "next/cache";
import { obterSessao, podeGerir, type Cargo } from "@/lib/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type EstadoConvite = { erro?: string; ok?: string };
const CARGOS: Cargo[] = ["dono", "gerente", "vendedor", "conferente"];

export async function convidar(_: EstadoConvite, form: FormData): Promise<EstadoConvite> {
  const { supabase, lojaAtual } = await obterSessao();
  if (!podeGerir(lojaAtual.cargo)) return { erro: "Só dona, sócios e gerente podem convidar." };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nome = String(form.get("nome") ?? "").trim();
  const cargo = String(form.get("cargo")) as Cargo;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };
  if (!nome) return { erro: "Informe o nome." };
  if (!CARGOS.includes(cargo)) return { erro: "Escolha o cargo." };

  const { data: jaMembro } = await supabase
    .from("membros")
    .select("perfis!inner(email)")
    .eq("loja_id", lojaAtual.id)
    .eq("perfis.email", email)
    .maybeSingle();
  if (jaMembro) return { erro: "Essa pessoa já faz parte desta loja." };

  // O banco (RLS) decide se este cargo pode convidar para esta loja.
  const { data: convite, error } = await supabase
    .from("convites")
    .insert({ email, loja_id: lojaAtual.id, cargo })
    .select("aceito_em")
    .single();
  if (error) return { erro: "Você não tem permissão para convidar com esse cargo." };

  revalidatePath("/equipe");
  if (convite.aceito_em) return { ok: `${email} já tinha conta e foi adicionado(a) a ${lojaAtual.nome}.` };

  const { error: erroEnvio } = await criarClienteAdmin().auth.admin.inviteUserByEmail(email, { data: { nome } });
  if (erroEnvio) return { erro: `Convite salvo, mas o e-mail não foi enviado: ${erroEnvio.message}` };
  return { ok: `Convite enviado para ${email}.` };
}

export async function cancelarConvite(id: string) {
  const { supabase } = await obterSessao();
  await supabase.from("convites").delete().eq("id", id);
  revalidatePath("/equipe");
}
