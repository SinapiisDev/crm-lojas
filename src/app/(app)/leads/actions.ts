"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { atualizarLeadIA } from "@/lib/ia/leads";
import { ETAPAS, ORIGENS, validarMudancaEtapa, type Etapa } from "@/lib/regras/leads";
import { formatarMoeda } from "@/lib/formatar";
import { obterSessao, podeGerir } from "@/lib/sessao";

export type Resultado = { erro?: string; ok?: boolean };

function atualizar(id?: string, analisar = false) {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
  // Com a IA ligada, reanalisa o lead depois de responder ao usuário (desligada: não faz nada).
  if (id && analisar) after(() => atualizarLeadIA(id).then(() => {}).catch((e) => console.error("IA após ação falhou", e)));
}

export async function criarLead(_: Resultado, form: FormData): Promise<Resultado> {
  const { supabase, usuario, lojaAtual } = await obterSessao();
  const nome = String(form.get("nome") ?? "").trim();
  const origem = String(form.get("origem") ?? "outro");
  const valor = String(form.get("valor_estimado") ?? "").replace(",", ".").trim();
  if (!nome) return { erro: "Informe o nome do cliente." };
  if (!ORIGENS.some((o) => o.id === origem)) return { erro: "Escolha a origem." };
  if (valor && !(Number(valor) >= 0)) return { erro: "Valor estimado inválido." };

  const vendedorEscolhido = String(form.get("vendedor_id") ?? "");
  const vendedor_id = podeGerir(lojaAtual.cargo) && vendedorEscolhido ? vendedorEscolhido : usuario.id;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      loja_id: lojaAtual.id,
      vendedor_id,
      nome,
      telefone: String(form.get("telefone") ?? "").trim(),
      origem,
      valor_estimado: valor ? Number(valor) : null,
    })
    .select("id")
    .single();
  if (error) return { erro: "Não foi possível salvar o lead." };
  await supabase.from("lead_eventos").insert({ lead_id: data.id, tipo: "criado", autor_id: usuario.id });
  atualizar(data.id, true);
  return { ok: true };
}

export async function moverLead(
  id: string,
  etapa: Etapa,
  extras: { valorVendido?: number; motivoPerda?: string } = {},
): Promise<Resultado> {
  if (!ETAPAS.some((e) => e.id === etapa)) return { erro: "Etapa inválida." };
  const erro = validarMudancaEtapa(etapa, extras);
  if (erro) return { erro };

  const { supabase, usuario } = await obterSessao();
  const mudancas: Record<string, unknown> = { etapa };
  if (etapa === "vendido") mudancas.valor_vendido = extras.valorVendido;
  if (etapa === "perdido") mudancas.motivo_perda = extras.motivoPerda!.trim();

  const { data, error } = await supabase.from("leads").update(mudancas).eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível mover o lead." };

  const titulo = ETAPAS.find((e) => e.id === etapa)!.titulo;
  const detalhe =
    etapa === "vendido" ? ` (${formatarMoeda(extras.valorVendido)})` : etapa === "perdido" ? ` (${extras.motivoPerda!.trim()})` : "";
  await supabase.from("lead_eventos").insert({ lead_id: id, tipo: "etapa", texto: titulo + detalhe, autor_id: usuario.id });
  atualizar(id, true);
  return { ok: true };
}

async function registrar(id: string, tipo: "contato" | "whatsapp", texto: string): Promise<Resultado> {
  const { supabase, usuario } = await obterSessao();
  const { data, error } = await supabase
    .from("leads")
    .update({ ultimo_contato_em: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { erro: "Não foi possível registrar." };
  await supabase.from("lead_eventos").insert({ lead_id: id, tipo, texto, autor_id: usuario.id });
  atualizar(id, tipo === "contato");
  return { ok: true };
}

export async function registrarContato(id: string, texto: string): Promise<Resultado> {
  if (!texto.trim()) return { erro: "Escreva o que foi conversado." };
  return registrar(id, "contato", texto.trim());
}

export async function registrarWhatsApp(id: string): Promise<Resultado> {
  return registrar(id, "whatsapp", "Abriu o WhatsApp");
}
