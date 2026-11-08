import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Cargo = "dono" | "gerente" | "vendedor" | "conferente";
export type LojaDoUsuario = { id: string; nome: string; cargo: Cargo; dias_lead_parado: number };

export const COOKIE_LOJA = "loja";

// Uma vez por requisição: usuário logado, lojas dele e a loja escolhida.
export const obterSessao = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil }, { data: vinculos }] = await Promise.all([
    supabase.from("perfis").select("id, nome, email").eq("id", user.id).single(),
    supabase.from("membros").select("cargo, lojas(id, nome, dias_lead_parado)").eq("usuario_id", user.id),
  ]);
  const lojas: LojaDoUsuario[] = (vinculos ?? [])
    .flatMap((v) => (v.lojas ? [{ ...(v.lojas as unknown as Omit<LojaDoUsuario, "cargo">), cargo: v.cargo as Cargo }] : []))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  if (!perfil || !lojas.length) redirect("/login?erro=sem-loja");

  const escolhida = (await cookies()).get(COOKIE_LOJA)?.value;
  const lojaAtual = lojas.find((l) => l.id === escolhida) ?? lojas[0];
  return { supabase, usuario: perfil, lojas, lojaAtual };
});

export const podeGerir = (cargo: Cargo) => cargo === "dono" || cargo === "gerente";
