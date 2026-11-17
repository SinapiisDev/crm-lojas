import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  FormatoAssistente,
  responderAssistente,
  validarLeads,
  validarMemorias,
  validarPropostas,
  type Mensagem,
  type Pessoa,
  type Proposta,
  type PropostaLead,
  type PropostaMemoria,
} from "./assistente";
import type { ModeloIA } from "./modelo";

// Conversa do Assistente: o servidor é a fonte da verdade (uma linha por pessoa em conversas_ia, protegida por RLS).
export type EstadoConversa = { mensagens: Mensagem[]; tarefas: Proposta[]; leads: PropostaLead[]; memorias: PropostaMemoria[] };

const MAX_GUARDADAS = 40;
const MAX_PARA_IA = 20;
const MAX_MEMORIAS_POR_LOJA = 30;
const ERRO_IA = "A IA não respondeu agora. Tente de novo em instantes.";

const FormatoMensagens = z.array(z.object({ autor: z.enum(["voce", "ia"]), texto: z.string().max(2000) }));
const FormatoMemorias = FormatoAssistente.shape.memorias;
const ler = <T,>(f: z.ZodType<T>, x: unknown, padrao: T): T => f.safeParse(x).data ?? padrao;
type Ctx = { equipe: Pessoa[]; hoje: string };

// O que veio do banco é revalidado contra a equipe de hoje: quem saiu da loja perde as propostas.
export async function lerConversa(supabase: SupabaseClient, usuarioId: string, equipe: Pessoa[], hoje: string): Promise<EstadoConversa> {
  const { data } = await supabase.from("conversas_ia").select("mensagens, tarefas, leads, memorias").eq("usuario_id", usuarioId).maybeSingle();
  return {
    mensagens: ler(FormatoMensagens, data?.mensagens, []),
    tarefas: validarPropostas(ler(FormatoAssistente.shape.tarefas, data?.tarefas, []), equipe, hoje),
    leads: validarLeads(ler(FormatoAssistente.shape.leads, data?.leads, []), equipe),
    memorias: validarMemorias(ler(FormatoMemorias, data?.memorias, []), equipe),
  };
}

export async function gravarConversa(supabase: SupabaseClient, usuarioId: string, estado: EstadoConversa): Promise<void> {
  const { error } = await supabase.from("conversas_ia").upsert({
    usuario_id: usuarioId,
    mensagens: estado.mensagens.slice(-MAX_GUARDADAS),
    tarefas: estado.tarefas,
    leads: estado.leads,
    memorias: estado.memorias,
    atualizado_em: new Date().toISOString(),
  });
  if (error) console.error("gravar conversa do assistente falhou", error);
}

export async function enviarMensagem(
  supabase: SupabaseClient,
  usuarioId: string,
  texto: string,
  ctx: Ctx & { retrato: string },
  modelo?: ModeloIA,
): Promise<EstadoConversa | { erro: string }> {
  const limpo = texto.trim();
  if (!limpo || limpo.length > 2000) return { erro: "Escreva o pedido (até 2000 caracteres)." };
  const estado = await lerConversa(supabase, usuarioId, ctx.equipe, ctx.hoje);
  estado.mensagens = [...estado.mensagens, { autor: "voce", texto: limpo }];
  // A mensagem fica salva mesmo se a IA falhar: a dona não perde o que escreveu.
  await gravarConversa(supabase, usuarioId, estado);
  const r = await responderAssistente(
    {
      hoje: ctx.hoje,
      equipe: ctx.equipe,
      retrato: ctx.retrato,
      conversa: estado.mensagens.slice(-MAX_PARA_IA),
      pendentes: estado.tarefas,
      pendentesLeads: estado.leads,
      pendentesMemorias: estado.memorias,
    },
    modelo,
  );
  if (!r) return { erro: ERRO_IA };
  const novo: EstadoConversa = {
    mensagens: [...estado.mensagens, { autor: "ia" as const, texto: r.resposta }].slice(-MAX_GUARDADAS),
    tarefas: r.tarefas.slice(0, 30),
    leads: r.leads.slice(0, 30),
    memorias: r.memorias.slice(0, 30),
  };
  await gravarConversa(supabase, usuarioId, novo);
  return novo;
}

const LISTA = { tarefa: "tarefas", lead: "leads", memoria: "memorias" } as const;

export async function removerProposta(
  supabase: SupabaseClient,
  usuarioId: string,
  tipo: keyof typeof LISTA,
  indice: number,
  ctx: Ctx,
): Promise<EstadoConversa> {
  const estado = await lerConversa(supabase, usuarioId, ctx.equipe, ctx.hoje);
  const chave = LISTA[tipo];
  (estado[chave] as unknown[]) = estado[chave].filter((_, i) => i !== indice);
  await gravarConversa(supabase, usuarioId, estado);
  return estado;
}

// Grava com a sessão de quem confirmou (RLS: só gerência da loja). Limite por loja conferido aqui.
export async function criarMemorias(
  supabase: SupabaseClient,
  usuarioId: string,
  memorias: PropostaMemoria[],
): Promise<{ criadas: number; falhas: string[] }> {
  let criadas = 0;
  const falhas: string[] = [];
  for (const m of memorias) {
    const { count } = await supabase.from("memorias_ia").select("id", { count: "exact", head: true }).eq("loja_id", m.loja_id);
    if ((count ?? 0) >= MAX_MEMORIAS_POR_LOJA) {
      falhas.push(`"${m.texto}": a loja já tem ${MAX_MEMORIAS_POR_LOJA} memórias, apague alguma antes.`);
      continue;
    }
    const { error } = await supabase.from("memorias_ia").insert({ loja_id: m.loja_id, texto: m.texto, criado_por: usuarioId });
    if (error) falhas.push(`"${m.texto}": não foi possível guardar.`);
    else criadas++;
  }
  return { criadas, falhas };
}
