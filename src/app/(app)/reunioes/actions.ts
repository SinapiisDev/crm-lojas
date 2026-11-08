"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { enviarConvitesReuniao } from "@/lib/avisos/convites-reuniao";
import { despacharAvisos } from "@/lib/avisos/despachar";
import { paraUtc } from "@/lib/regras/reunioes";
import { obterSessao } from "@/lib/sessao";

export type Resultado = { erro?: string; ok?: boolean };

const ERROS: Record<string, string> = {
  sem_permissao: "Você não tem permissão para isso.",
  titulo_obrigatorio: "Informe o título.",
  inicio_obrigatorio: "Informe data e hora.",
  participante_invalido: "Alguém escolhido não faz parte da loja.",
  reuniao_cancelada: "A reunião foi cancelada.",
  escolha_se_aconteceu: "Diga se a reunião aconteceu.",
  ata_obrigatoria: "Escreva o que foi decidido.",
  reuniao_nao_comecou: "A reunião ainda não começou.",
  ja_registrada: "A reunião já foi registrada. Só a gerência corrige.",
};
const traduzir = (msg?: string) => ERROS[msg ?? ""] ?? "Não foi possível salvar.";
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

function depois(id: string, convite?: "REQUEST" | "CANCEL") {
  revalidatePath("/tarefas");
  revalidatePath("/painel");
  revalidatePath(`/reunioes/${id}`);
  after(async () => {
    if (convite) await enviarConvitesReuniao(id, convite);
    await despacharAvisos().catch((e) => console.error("despacho após reunião falhou", e));
  });
}

export async function criarReuniao(_: Resultado, form: FormData): Promise<Resultado> {
  const { supabase, lojaAtual } = await obterSessao();
  const data = String(form.get("data") ?? "");
  const hora = String(form.get("hora") ?? "");
  if (!DATA.test(data) || !HORA.test(hora)) return { erro: "Informe data e hora." };
  const { data: id, error } = await supabase.rpc("criar_reuniao", {
    p_loja: lojaAtual.id,
    p_titulo: String(form.get("titulo") ?? ""),
    p_pauta: String(form.get("pauta") ?? ""),
    p_inicio: paraUtc(data, hora),
    p_duracao: Number(form.get("duracao") ?? 60),
    p_local: String(form.get("local") ?? ""),
    p_participantes: form.getAll("participantes").map(String),
  });
  if (error) return { erro: traduzir(error.message) };
  depois(id as string, "REQUEST");
  return { ok: true };
}

export async function registrarReuniao(id: string, aconteceu: boolean, ata: string): Promise<Resultado> {
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("registrar_reuniao", { p_reuniao: id, p_aconteceu: aconteceu, p_ata: ata });
  if (error) return { erro: traduzir(error.message) };
  depois(id);
  return { ok: true };
}

export async function remarcarReuniao(id: string, data: string, hora: string, duracao: number): Promise<Resultado> {
  if (!DATA.test(data) || !HORA.test(hora)) return { erro: "Informe data e hora." };
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("remarcar_reuniao", { p_reuniao: id, p_inicio: paraUtc(data, hora), p_duracao: duracao });
  if (error) return { erro: traduzir(error.message) };
  depois(id, "REQUEST");
  return { ok: true };
}

export async function cancelarReuniao(id: string): Promise<Resultado> {
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("cancelar_reuniao", { p_reuniao: id });
  if (error) return { erro: traduzir(error.message) };
  depois(id, "CANCEL");
  return { ok: true };
}
