"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { despacharAvisos } from "@/lib/avisos/despachar";
import { atualizarLeadIA } from "@/lib/ia/leads";
import type { Pessoa } from "@/lib/ia/assistente";
import { criarMemorias, enviarMensagem, gravarConversa, lerConversa, removerProposta, type EstadoConversa } from "@/lib/ia/conversa";
import { carregarRetrato, montarRetrato } from "@/lib/ia/retrato";
import { hojeSP } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";

const SO_GERENCIA = "Só a dona e a gerência usam o assistente.";

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

// Para a página carregar a conversa salva com a mesma equipe que as ações usam.
export async function equipeDoAssistente(): Promise<Pessoa[]> {
  return equipe();
}

// Contexto de toda ação do assistente: sessão, lojas geridas e equipe delas.
async function contexto() {
  const { supabase, usuario, lojas } = await obterSessao();
  return { supabase, usuario, geridas: lojas.filter((l) => podeGerir(l.cargo)), pessoas: await equipe(), hoje: hojeSP() };
}

export async function conversar(texto: string): Promise<EstadoConversa | { erro: string }> {
  const c = await contexto();
  if (!c.pessoas.length) return { erro: SO_GERENCIA };
  const lojas = c.geridas.map(({ id, nome, dias_lead_parado }) => ({ id, nome, dias_lead_parado }));
  const retrato = montarRetrato(await carregarRetrato(c.supabase, lojas));
  return enviarMensagem(c.supabase, c.usuario.id, String(texto ?? ""), { equipe: c.pessoas, hoje: c.hoje, retrato });
}

const TIPOS_PROPOSTA = ["tarefa", "lead", "memoria"] as const;

export async function tirarProposta(tipo: (typeof TIPOS_PROPOSTA)[number], indice: number): Promise<EstadoConversa | { erro: string }> {
  if (!TIPOS_PROPOSTA.includes(tipo) || !Number.isInteger(indice)) return { erro: "Proposta inválida." };
  const c = await contexto();
  if (!c.pessoas.length) return { erro: SO_GERENCIA };
  return removerProposta(c.supabase, c.usuario.id, tipo, indice, { equipe: c.pessoas, hoje: c.hoje });
}

export async function novaConversa(): Promise<EstadoConversa> {
  const { supabase, usuario } = await obterSessao();
  await supabase.from("conversas_ia").delete().eq("usuario_id", usuario.id);
  return { mensagens: [], tarefas: [], leads: [], memorias: [] };
}

export async function apagarMemoria(id: string): Promise<{ ok: true } | { erro: string }> {
  const { supabase } = await obterSessao();
  // RLS: só a gerência da loja apaga.
  const { data, error } = await supabase.from("memorias_ia").delete().eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível apagar." };
  revalidatePath("/assistente");
  return { ok: true };
}

export type ResultadoCriacao = { criadas: number; leads: number; memorias: number; falhas: string[]; estado: EstadoConversa };

// Cria o que está proposto na conversa salva. Tira da conversa só o que foi criado; o que falhou fica para tentar de novo.
export async function criarPropostas(): Promise<ResultadoCriacao | { erro: string }> {
  const c = await contexto();
  if (!c.pessoas.length) return { erro: SO_GERENCIA };
  const { supabase, usuario } = c;
  const estado = await lerConversa(supabase, usuario.id, c.pessoas, c.hoje);
  const { tarefas: validas, leads } = estado;
  if (!validas.length && !leads.length && !estado.memorias.length) return { erro: "Nada válido para criar." };
  const falhas: string[] = [];
  // Gravação com a sessão de quem confirmou: as regras do banco (RLS) valem como no formulário.
  let tarefasCriadas = 0;
  if (validas.length) {
    const { error } = await supabase.from("tarefas").insert(
      validas.map((t) => ({ loja_id: t.loja_id, responsavel_id: t.responsavel_id, titulo: t.titulo, descricao: t.descricao || null, prazo: t.prazo })),
    );
    if (error) falhas.push("Não foi possível criar as tarefas.");
    else {
      tarefasCriadas = validas.length;
      revalidatePath("/tarefas");
      revalidatePath("/painel");
      after(() => despacharAvisos().catch((e) => console.error("despacho após assistente falhou", e)));
    }
  }
  const leadsFalharam: typeof leads = [];
  for (const l of leads) {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        loja_id: l.loja_id,
        vendedor_id: l.vendedor_id,
        nome: l.nome,
        telefone: l.telefone,
        origem: l.origem,
        tipo: l.tipo,
        etapa: l.etapa,
        valor_estimado: l.valor_estimado,
      })
      .select("id")
      .single();
    if (error) {
      leadsFalharam.push(l);
      falhas.push(`Lead ${l.nome} não pôde ser salvo.`);
      continue;
    }
    await supabase.from("lead_eventos").insert([
      { lead_id: data.id, tipo: "criado", autor_id: usuario.id },
      ...(l.resumo ? [{ lead_id: data.id, tipo: "contato" as const, texto: l.resumo, autor_id: usuario.id }] : []),
    ]);
    after(() => atualizarLeadIA(data.id).then(() => {}).catch((e) => console.error("IA após assistente falhou", e)));
  }
  if (leads.length > leadsFalharam.length) {
    revalidatePath("/leads");
    revalidatePath("/painel");
  }
  const mem = await criarMemorias(supabase, usuario.id, estado.memorias);
  falhas.push(...mem.falhas);
  const memoriasFalharam = estado.memorias.filter((m) => mem.falhas.some((f) => f.startsWith(`"${m.texto}"`)));
  if (mem.criadas) revalidatePath("/assistente");

  // A conversa continua; só saem as propostas criadas.
  const novo: EstadoConversa = { ...estado, tarefas: tarefasCriadas ? [] : validas, leads: leadsFalharam, memorias: memoriasFalharam };
  await gravarConversa(supabase, usuario.id, novo);
  return { criadas: tarefasCriadas, leads: leads.length - leadsFalharam.length, memorias: mem.criadas, falhas, estado: novo };
}
