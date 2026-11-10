"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { after } from "next/server";
import { despacharAvisos } from "@/lib/avisos/despachar";
import { atualizarLeadIA } from "@/lib/ia/leads";
import {
  FormatoAssistente,
  responderAssistente,
  validarLeads,
  validarPropostas,
  type Mensagem,
  type Pessoa,
  type Proposta,
  type PropostaLead,
  type RespostaAssistente,
} from "@/lib/ia/assistente";
import { hojeSP } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";

// Entrada vem do navegador: formato conferido antes de qualquer uso.
const lerTarefas = (x: unknown) => FormatoAssistente.shape.tarefas.safeParse(x).data ?? [];
const lerLeads = (x: unknown) => FormatoAssistente.shape.leads.safeParse(x).data ?? [];
const FormatoConversa = z.array(z.object({ autor: z.enum(["voce", "ia"]), texto: z.string().max(2000) })).min(1);

// Equipe das lojas que a pessoa gerencia (só dona e gerente usam o assistente).
async function equipe(): Promise<Pessoa[]> {
  const { supabase, lojas } = await obterSessao();
  const geridas = lojas.filter((l) => podeGerir(l.cargo));
  if (!geridas.length) return [];
  const { data } = await supabase
    .from("membros")
    .select("cargo, loja_id, perfis(id, nome)")
    .in("loja_id", geridas.map((l) => l.id));
  return (data ?? []).flatMap((m) => {
    const p = m.perfis as unknown as { id: string; nome: string } | null;
    const loja = geridas.find((l) => l.id === m.loja_id)!;
    return p ? [{ id: p.id, nome: p.nome, cargo: m.cargo, loja_id: loja.id, loja: loja.nome }] : [];
  });
}

export async function conversar(
  conversa: Mensagem[],
  pendentes: Proposta[],
  pendentesLeads: PropostaLead[] = [],
): Promise<RespostaAssistente | { erro: string }> {
  const pessoas = await equipe();
  if (!pessoas.length) return { erro: "Só a dona e a gerência usam o assistente." };
  const hoje = hojeSP();
  // Limites para a conversa não crescer sem fim (custo e tamanho do pedido).
  const lida = FormatoConversa.safeParse(conversa);
  if (!lida.success) return { erro: "Escreva o pedido (até 2000 caracteres)." };
  const recente = lida.data.slice(-20);
  const r = await responderAssistente({
    hoje,
    equipe: pessoas,
    conversa: recente,
    pendentes: validarPropostas(lerTarefas(pendentes).slice(0, 30), pessoas, hoje),
    pendentesLeads: validarLeads(lerLeads(pendentesLeads).slice(0, 30), pessoas),
  });
  return r ?? { erro: "A IA não respondeu agora. Tente de novo em instantes." };
}

export async function criarPropostas(
  propostas: Proposta[],
  propostasLeads: PropostaLead[] = [],
): Promise<{ criadas: number; leads: number; falhas: number } | { erro: string }> {
  const pessoas = await equipe();
  const validas = validarPropostas(lerTarefas(propostas).slice(0, 30), pessoas, hojeSP());
  const leads = validarLeads(lerLeads(propostasLeads).slice(0, 30), pessoas);
  if (!validas.length && !leads.length) return { erro: "Nada válido para criar." };
  const { supabase, usuario } = await obterSessao();
  // Gravação com a sessão de quem confirmou: as regras do banco (RLS) valem como no formulário.
  if (validas.length) {
    const { error } = await supabase.from("tarefas").insert(
      validas.map((t) => ({ loja_id: t.loja_id, responsavel_id: t.responsavel_id, titulo: t.titulo, descricao: t.descricao || null, prazo: t.prazo })),
    );
    if (error) return { erro: "Não foi possível criar as tarefas." };
    revalidatePath("/tarefas");
    revalidatePath("/painel");
    after(() => despacharAvisos().catch((e) => console.error("despacho após assistente falhou", e)));
  }
  let criados = 0;
  for (const l of leads) {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        loja_id: l.loja_id,
        vendedor_id: l.vendedor_id,
        nome: l.nome,
        telefone: l.telefone,
        origem: l.origem,
        etapa: l.etapa,
        valor_estimado: l.valor_estimado,
      })
      .select("id")
      .single();
    if (error) continue;
    criados++;
    await supabase.from("lead_eventos").insert([
      { lead_id: data.id, tipo: "criado", autor_id: usuario.id },
      ...(l.resumo ? [{ lead_id: data.id, tipo: "contato" as const, texto: l.resumo, autor_id: usuario.id }] : []),
    ]);
    after(() => atualizarLeadIA(data.id).then(() => {}).catch((e) => console.error("IA após assistente falhou", e)));
  }
  if (criados) {
    revalidatePath("/leads");
    revalidatePath("/painel");
  }
  // Não devolve erro aqui: o que já gravou não pode ser reenviado (duplicaria).
  return { criadas: validas.length, leads: criados, falhas: leads.length - criados };
}
