"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Estado = { erro?: string; aviso?: string };

export async function entrar(_: Estado, form: FormData): Promise<Estado> {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("senha") ?? ""),
  });
  if (error) return { erro: "E-mail ou senha incorretos." };
  redirect("/");
}

export async function esqueciSenha(_: Estado, form: FormData): Promise<Estado> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { erro: "Digite seu e-mail para receber o link." };
  const supabase = await criarClienteServidor();
  await supabase.auth.resetPasswordForEmail(email);
  // Mesma resposta exista ou não a conta, para não revelar quem está cadastrado.
  return { aviso: "Se o e-mail estiver cadastrado, você vai receber um link para criar nova senha." };
}

export async function definirSenha(_: Estado, form: FormData): Promise<Estado> {
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== form.get("confirmar")) return { erro: "As senhas não são iguais." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return { erro: "Não foi possível salvar a senha. Abra o link do e-mail de novo." };
  redirect("/");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
