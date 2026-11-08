"use server";

import { revalidatePath } from "next/cache";
import { RECORRENCIAS, STATUS_TAREFA, hojeSP, type StatusTarefa } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";

export type Resultado = { erro?: string; ok?: boolean };

// Erros levantados pelas funções do banco (raise exception '<codigo>').
const ERROS: Record<string, string> = {
  sem_permissao: "Você não tem permissão para isso.",
  tarefa_concluida: "A tarefa já foi concluída.",
  mensagem_obrigatoria: "Escreva a mensagem.",
  motivo_obrigatorio: "Explique o motivo.",
  prazo_no_passado: "O novo prazo não pode ser no passado.",
  sem_pedido: "Não há pedido de prazo pendente.",
};
const traduzir = (msg?: string) => ERROS[msg ?? ""] ?? "Não foi possível salvar.";

function atualizar(id?: string) {
  revalidatePath("/tarefas");
  if (id) revalidatePath(`/tarefas/${id}`);
}

export async function criarTarefa(_: Resultado, form: FormData): Promise<Resultado> {
  const { supabase, usuario, lojaAtual } = await obterSessao();
  const titulo = String(form.get("titulo") ?? "").trim();
  const prazo = String(form.get("prazo") ?? "");
  const recorrencia = String(form.get("recorrencia") ?? "");
  if (!titulo) return { erro: "Informe o título." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { erro: "Informe o prazo." };
  if (prazo < hojeSP()) return { erro: "O prazo não pode ser no passado." };
  if (recorrencia && !RECORRENCIAS.some((r) => r.id === recorrencia)) return { erro: "Recorrência inválida." };

  const escolhido = String(form.get("responsavel_id") ?? "");
  const { error } = await supabase.from("tarefas").insert({
    loja_id: lojaAtual.id,
    titulo,
    descricao: String(form.get("descricao") ?? "").trim() || null,
    responsavel_id: podeGerir(lojaAtual.cargo) && escolhido ? escolhido : usuario.id,
    prazo,
    recorrencia: recorrencia || null,
  });
  if (error) return { erro: traduzir(error.message) };
  atualizar();
  return { ok: true };
}

export async function mudarStatus(id: string, status: StatusTarefa): Promise<Resultado> {
  if (!STATUS_TAREFA.some((s) => s.id === status)) return { erro: "Status inválido." };
  const { supabase } = await obterSessao();
  const { data, error } = await supabase.from("tarefas").update({ status }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: traduzir(error?.message ?? "sem_permissao") };
  atualizar(id);
  return { ok: true };
}

export async function cobrar(id: string, mensagem: string): Promise<Resultado> {
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("cobrar_tarefa", { p_tarefa: id, p_mensagem: mensagem });
  if (error) return { erro: traduzir(error.message) };
  atualizar(id);
  return { ok: true };
}

export async function pedirNovoPrazo(id: string, prazo: string, motivo: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return { erro: "Escolha a data." };
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("pedir_novo_prazo", { p_tarefa: id, p_prazo: prazo, p_motivo: motivo });
  if (error) return { erro: traduzir(error.message) };
  atualizar(id);
  return { ok: true };
}

export async function decidirNovoPrazo(id: string, aprovar: boolean): Promise<Resultado> {
  const { supabase } = await obterSessao();
  const { error } = await supabase.rpc("decidir_novo_prazo", { p_tarefa: id, p_aprovar: aprovar });
  if (error) return { erro: traduzir(error.message) };
  atualizar(id);
  return { ok: true };
}
