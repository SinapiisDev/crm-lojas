"use server";

import { redirect } from "next/navigation";
import { criarEmpresa, lerCadastro, validarCadastro } from "@/lib/cadastro";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Estado } from "../login/actions";

export async function cadastrar(_: Estado, form: FormData): Promise<Estado> {
  const dados = lerCadastro(form);
  const erro = validarCadastro(dados);
  if (erro) return { erro };

  const r = await criarEmpresa(criarClienteAdmin(), dados);
  if ("erro" in r) return r;

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.email, password: dados.senha });
  if (error) redirect("/login");
  redirect("/");
}
