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
import { chaveProposta, type TipoProposta } from "./chave";
import type { ModeloIA } from "./modelo";

export { chaveProposta, type TipoProposta };

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
async function lerLinha(supabase: SupabaseClient, usuarioId: string, ctx: Ctx): Promise<{ estado: EstadoConversa; versao: number | null }> {
  const { data } = await supabase
    .from("conversas_ia")
    .select("mensagens, tarefas, leads, memorias, versao")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  return {
    versao: data ? Number(data.versao) : null,
    estado: {
      mensagens: ler(FormatoMensagens, data?.mensagens, []),
      tarefas: validarPropostas(ler(FormatoAssistente.shape.tarefas, data?.tarefas, []), ctx.equipe, ctx.hoje),
      leads: validarLeads(ler(FormatoAssistente.shape.leads, data?.leads, []), ctx.equipe),
      memorias: validarMemorias(ler(FormatoMemorias, data?.memorias, []), ctx.equipe),
    },
  };
}

export async function lerConversa(supabase: SupabaseClient, usuarioId: string, equipe: Pessoa[], hoje: string): Promise<EstadoConversa> {
  return (await lerLinha(supabase, usuarioId, { equipe, hoje })).estado;
}

// Grava só se a versão ainda é a lida (outro aparelho pode ter mudado no meio). Devolve a versão nova ou null em conflito.
async function gravarSe(supabase: SupabaseClient, usuarioId: string, estado: EstadoConversa, versao: number | null): Promise<number | null> {
  const linha = {
    mensagens: estado.mensagens.slice(-MAX_GUARDADAS),
    tarefas: estado.tarefas,
    leads: estado.leads,
    memorias: estado.memorias,
    atualizado_em: new Date().toISOString(),
  };
  if (versao === null) {
    const { error } = await supabase.from("conversas_ia").insert({ ...linha, usuario_id: usuarioId, versao: 1 });
    return error ? null : 1;
  }
  const { data, error } = await supabase
    .from("conversas_ia")
    .update({ ...linha, versao: versao + 1 })
    .eq("usuario_id", usuarioId)
    .eq("versao", versao)
    .select("versao");
  if (error) console.error("gravar conversa do assistente falhou", error);
  return data?.length ? versao + 1 : null;
}

// Lê, aplica a mudança e grava; em conflito, relê e tenta de novo. Erro persistente lança (quem chama não pode seguir achando que gravou).
async function atualizarConversa<T = void>(
  supabase: SupabaseClient,
  usuarioId: string,
  ctx: Ctx,
  mudar: (atual: EstadoConversa) => { estado: EstadoConversa; extra?: T },
): Promise<{ estado: EstadoConversa; versao: number; extra?: T }> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { estado: atual, versao } = await lerLinha(supabase, usuarioId, ctx);
    const r = mudar(atual);
    const nova = await gravarSe(supabase, usuarioId, r.estado, versao);
    if (nova !== null) return { estado: { ...r.estado, mensagens: r.estado.mensagens.slice(-MAX_GUARDADAS) }, versao: nova, extra: r.extra };
  }
  throw new Error("não foi possível gravar a conversa do assistente");
}

export async function gravarConversa(supabase: SupabaseClient, usuarioId: string, estado: EstadoConversa): Promise<void> {
  await atualizarConversa(supabase, usuarioId, { equipe: [], hoje: "" }, () => ({ estado }));
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
  // A mensagem fica salva mesmo se a IA falhar: a dona não perde o que escreveu.
  const { estado, versao } = await atualizarConversa(supabase, usuarioId, ctx, (atual) => ({
    estado: { ...atual, mensagens: [...atual.mensagens, { autor: "voce" as const, texto: limpo }] },
  }));
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
  const resposta = { autor: "ia" as const, texto: r.resposta };
  const novo: EstadoConversa = {
    mensagens: [...estado.mensagens, resposta].slice(-MAX_GUARDADAS),
    tarefas: r.tarefas.slice(0, 30),
    leads: r.leads.slice(0, 30),
    memorias: r.memorias.slice(0, 30),
  };
  if ((await gravarSe(supabase, usuarioId, novo, versao)) !== null) return novo;
  // Outro aparelho mudou a conversa enquanto a IA pensava (confirmou, tirou proposta, recomeçou):
  // guarda só a resposta e mantém as propostas como estão agora, para nada criado voltar e ser criado de novo.
  return (await atualizarConversa(supabase, usuarioId, ctx, (atual) => ({ estado: { ...atual, mensagens: [...atual.mensagens, resposta] } }))).estado;
}

type Propostas = Pick<EstadoConversa, "tarefas" | "leads" | "memorias">;
const LISTA = { tarefa: "tarefas", lead: "leads", memoria: "memorias" } as const;

export async function removerProposta(supabase: SupabaseClient, usuarioId: string, tipo: TipoProposta, chave: string, ctx: Ctx): Promise<EstadoConversa> {
  const chaveLista = LISTA[tipo];
  return (
    await atualizarConversa(supabase, usuarioId, ctx, (atual) => ({
      estado: { ...atual, [chaveLista]: (atual[chaveLista] as (Proposta | PropostaLead | PropostaMemoria)[]).filter((p) => chaveProposta(tipo, p) !== chave) },
    }))
  ).estado;
}

// Confirmar: primeiro tira as propostas da conversa (gravado), depois cria. Se algo cair no meio, perde-se a proposta, nunca se duplica o registro.
export async function reservarPropostas(supabase: SupabaseClient, usuarioId: string, ctx: Ctx): Promise<Propostas> {
  const r = await atualizarConversa<Propostas>(supabase, usuarioId, ctx, (atual) => ({
    estado: { ...atual, tarefas: [], leads: [], memorias: [] },
    extra: { tarefas: atual.tarefas, leads: atual.leads, memorias: atual.memorias },
  }));
  return r.extra!;
}

// O que falhou ao criar volta para a conversa, sem repetir o que já estiver lá.
export async function devolverPropostas(supabase: SupabaseClient, usuarioId: string, falhas: Propostas, ctx: Ctx): Promise<EstadoConversa> {
  const juntar = <T extends Proposta | PropostaLead | PropostaMemoria>(tipo: TipoProposta, atuais: T[], voltam: T[]) => [
    ...atuais,
    ...voltam.filter((v) => !atuais.some((a) => chaveProposta(tipo, a) === chaveProposta(tipo, v))),
  ];
  return (
    await atualizarConversa(supabase, usuarioId, ctx, (atual) => ({
      estado: {
        ...atual,
        tarefas: juntar("tarefa", atual.tarefas, falhas.tarefas),
        leads: juntar("lead", atual.leads, falhas.leads),
        memorias: juntar("memoria", atual.memorias, falhas.memorias),
      },
    }))
  ).estado;
}

// Grava com a sessão de quem confirmou (RLS: só gerência da loja). Limite por loja conferido aqui.
export async function criarMemorias(
  supabase: SupabaseClient,
  usuarioId: string,
  memorias: PropostaMemoria[],
): Promise<{ criadas: number; falhas: string[]; falharam: PropostaMemoria[] }> {
  let criadas = 0;
  const falhas: string[] = [];
  const falharam: PropostaMemoria[] = [];
  for (const m of memorias) {
    const { count } = await supabase.from("memorias_ia").select("id", { count: "exact", head: true }).eq("loja_id", m.loja_id);
    if ((count ?? 0) >= MAX_MEMORIAS_POR_LOJA) {
      falhas.push(`"${m.texto}": a loja já tem ${MAX_MEMORIAS_POR_LOJA} memórias, apague alguma antes.`);
      falharam.push(m);
      continue;
    }
    const { error } = await supabase.from("memorias_ia").insert({ loja_id: m.loja_id, texto: m.texto, criado_por: usuarioId });
    if (error) {
      falhas.push(`"${m.texto}": não foi possível guardar.`);
      falharam.push(m);
    } else criadas++;
  }
  return { criadas, falhas, falharam };
}
