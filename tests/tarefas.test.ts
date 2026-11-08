// Tarefas, cobrança, pedido de prazo e avisos no banco. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "t" + Date.now().toString(36);
const SENHA = "senha-de-teste-123";
type Cargo = "dono" | "gerente" | "vendedor" | "conferente";
type Usuario = { id: string; cliente: SupabaseClient };

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (data: string, n: number) => {
  const d = new Date(data + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let loja1 = "";
let loja2 = "";
let gerente: Usuario;
let vendA: Usuario;
let vendB: Usuario;
let conferente: Usuario;
let outraLoja: Usuario;

async function criarUsuario(nome: string, vinculos: [string, Cargo][]): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  for (const [loja_id, cargo] of vinculos) await admin.from("convites").insert({ email, loja_id, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: SENHA });
  return { id: data.user!.id, cliente };
}

async function tarefa(quem: Usuario, campos: Record<string, unknown>) {
  return quem.cliente
    .from("tarefas")
    .insert({ loja_id: loja1, prazo: hoje, ...campos })
    .select("*")
    .single();
}

async function avisos(quem: Usuario) {
  const { data } = await quem.cliente.from("notificacoes").select("titulo, texto, lida_em, usuario_id");
  return data ?? [];
}

beforeAll(async () => {
  const { data } = await admin.from("lojas").select("id, nome");
  loja1 = data!.find((l) => l.nome === "Loja 1")!.id;
  loja2 = data!.find((l) => l.nome === "Loja 2")!.id;
  gerente = await criarUsuario("ger", [[loja1, "gerente"]]);
  vendA = await criarUsuario("vena", [[loja1, "vendedor"]]);
  vendB = await criarUsuario("venb", [[loja1, "vendedor"]]);
  conferente = await criarUsuario("conf", [[loja1, "conferente"]]);
  outraLoja = await criarUsuario("out", [[loja2, "vendedor"]]);
});

describe("visibilidade e criação", () => {
  test("todos da loja veem as tarefas da loja; outra loja não", async () => {
    const { data: t } = await tarefa(gerente, { titulo: `vis-${sufixo}`, responsavel_id: vendA.id });
    for (const u of [vendA, vendB, conferente]) {
      const { data } = await u.cliente.from("tarefas").select("id").eq("id", t!.id);
      expect(data).toHaveLength(1);
    }
    const { data } = await outraLoja.cliente.from("tarefas").select("id").eq("id", t!.id);
    expect(data).toHaveLength(0);
  });

  test("vendedora cria tarefa para si e não para colega", async () => {
    expect((await tarefa(vendA, { titulo: "minha", responsavel_id: vendA.id })).error).toBeNull();
    expect((await tarefa(vendA, { titulo: "da colega", responsavel_id: vendB.id })).error).not.toBeNull();
  });

  test("responsável de outra loja é recusado", async () => {
    expect((await tarefa(gerente, { titulo: "x", responsavel_id: outraLoja.id })).error).not.toBeNull();
  });

  test("gerente cria tarefa para vendedora e ela recebe aviso", async () => {
    await tarefa(gerente, { titulo: `aviso-${sufixo}`, responsavel_id: vendB.id });
    expect((await avisos(vendB)).some((a) => a.texto?.includes(`aviso-${sufixo}`))).toBe(true);
  });
});

describe("edição", () => {
  test("responsável não muda prazo nem título direto", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "fixa", responsavel_id: vendA.id });
    expect((await vendA.cliente.from("tarefas").update({ prazo: somarDias(hoje, 10) }).eq("id", t!.id)).error).not.toBeNull();
    expect((await vendA.cliente.from("tarefas").update({ titulo: "outra" }).eq("id", t!.id)).error).not.toBeNull();
    expect((await vendA.cliente.from("tarefas").update({ status: "fazendo" }).eq("id", t!.id)).error).toBeNull();
  });

  test("colega não muda status de tarefa alheia", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "alheia", responsavel_id: vendA.id });
    const { data } = await vendB.cliente.from("tarefas").update({ status: "feito" }).eq("id", t!.id).select("id");
    expect(data ?? []).toHaveLength(0);
  });

  test("gerente muda prazo e o contador sobe", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "prazo", responsavel_id: vendA.id });
    const { data } = await gerente.cliente.from("tarefas").update({ prazo: somarDias(hoje, 3) }).eq("id", t!.id).select("prazo_alterado_vezes").single();
    expect(data!.prazo_alterado_vezes).toBe(1);
  });

  test("concluir registra quem e quando; reabrir limpa", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "concluir", responsavel_id: vendA.id });
    const { data: feita } = await vendA.cliente.from("tarefas").update({ status: "feito" }).eq("id", t!.id).select("*").single();
    expect(feita!.concluida_por).toBe(vendA.id);
    expect(feita!.concluida_em).not.toBeNull();
    const { data: aberta } = await vendA.cliente.from("tarefas").update({ status: "a_fazer" }).eq("id", t!.id).select("*").single();
    expect(aberta!.concluida_por).toBeNull();
    expect(aberta!.concluida_em).toBeNull();
  });

  test("recorrente semanal cria a próxima com prazo +7 uma única vez", async () => {
    const titulo = `fechar caixa ${sufixo}`;
    const { data: t } = await tarefa(gerente, { titulo, responsavel_id: vendA.id, recorrencia: "semanal" });
    await vendA.cliente.from("tarefas").update({ status: "feito" }).eq("id", t!.id);
    await vendA.cliente.from("tarefas").update({ status: "a_fazer" }).eq("id", t!.id);
    await vendA.cliente.from("tarefas").update({ status: "feito" }).eq("id", t!.id);
    const { data } = await admin.from("tarefas").select("prazo, status").eq("titulo", titulo).neq("id", t!.id);
    expect(data).toEqual([{ prazo: somarDias(hoje, 7), status: "a_fazer" }]);
  });
});

describe("cobrança e pedido de prazo", () => {
  test("vendedora não cobra; gerente cobra e responsável recebe aviso", async () => {
    const { data: t } = await tarefa(gerente, { titulo: `cobrar-${sufixo}`, responsavel_id: vendA.id });
    expect((await vendB.cliente.rpc("cobrar_tarefa", { p_tarefa: t!.id, p_mensagem: "e aí?" })).error).not.toBeNull();
    expect((await gerente.cliente.rpc("cobrar_tarefa", { p_tarefa: t!.id, p_mensagem: "Me dá um retorno" })).error).toBeNull();
    expect((await avisos(vendA)).some((a) => a.texto === "Me dá um retorno")).toBe(true);
    const { data: ev } = await vendA.cliente.from("tarefa_eventos").select("tipo, texto").eq("tarefa_id", t!.id).eq("tipo", "cobranca");
    expect(ev).toEqual([{ tipo: "cobranca", texto: "Me dá um retorno" }]);
  });

  test("pedido de prazo exige motivo e data futura; só o responsável pede", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "pedido", responsavel_id: vendA.id });
    const pedir = (u: Usuario, prazo: string, motivo: string) =>
      u.cliente.rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: prazo, p_motivo: motivo });
    expect((await pedir(vendA, somarDias(hoje, 2), "  ")).error).not.toBeNull();
    expect((await pedir(vendA, somarDias(hoje, -1), "cliente pediu")).error).not.toBeNull();
    expect((await pedir(vendB, somarDias(hoje, 2), "cliente pediu")).error).not.toBeNull();
    expect((await pedir(vendA, somarDias(hoje, 2), "cliente pediu")).error).toBeNull();
    const { data } = await admin.from("tarefas").select("prazo_pedido").eq("id", t!.id).single();
    expect(data!.prazo_pedido).toBe(somarDias(hoje, 2));
  });

  test("aprovar troca o prazo e avisa; recusar mantém", async () => {
    const { data: t } = await tarefa(gerente, { titulo: `aprovar-${sufixo}`, responsavel_id: vendA.id });
    await gerente.cliente.rpc("cobrar_tarefa", { p_tarefa: t!.id, p_mensagem: "retorno?" });
    await vendA.cliente.rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: somarDias(hoje, 4), p_motivo: "esperando medida" });
    expect((await avisos(gerente)).some((a) => a.texto?.includes("esperando medida"))).toBe(true);

    expect((await gerente.cliente.rpc("decidir_novo_prazo", { p_tarefa: t!.id, p_aprovar: true })).error).toBeNull();
    const { data: aprovada } = await admin.from("tarefas").select("prazo, prazo_pedido, prazo_alterado_vezes").eq("id", t!.id).single();
    expect(aprovada).toEqual({ prazo: somarDias(hoje, 4), prazo_pedido: null, prazo_alterado_vezes: 1 });
    expect((await avisos(vendA)).some((a) => a.titulo === "Novo prazo aprovado")).toBe(true);

    await vendA.cliente.rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: somarDias(hoje, 9), p_motivo: "de novo" });
    await gerente.cliente.rpc("decidir_novo_prazo", { p_tarefa: t!.id, p_aprovar: false });
    const { data: recusada } = await admin.from("tarefas").select("prazo, prazo_pedido").eq("id", t!.id).single();
    expect(recusada).toEqual({ prazo: somarDias(hoje, 4), prazo_pedido: null });
  });

  test("vendedora não aprova prazo", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "nao aprova", responsavel_id: vendA.id });
    await vendA.cliente.rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: somarDias(hoje, 2), p_motivo: "motivo" });
    expect((await vendA.cliente.rpc("decidir_novo_prazo", { p_tarefa: t!.id, p_aprovar: true })).error).not.toBeNull();
  });
});

describe("avisos", () => {
  test("cada um vê só os próprios avisos e marca como lidos", async () => {
    await tarefa(gerente, { titulo: `lidos-${sufixo}`, responsavel_id: vendB.id });
    const deB = await avisos(vendB);
    expect(deB.length).toBeGreaterThan(0);
    expect(deB.every((a) => a.usuario_id === vendB.id)).toBe(true);
    expect((await vendB.cliente.from("notificacoes").insert({ usuario_id: vendB.id, loja_id: loja1, titulo: "falso" })).error).not.toBeNull();
    await vendB.cliente.rpc("marcar_avisos_lidos");
    expect((await avisos(vendB)).every((a) => a.lida_em)).toBe(true);
  });
});

describe("correções da revisão", () => {
  const anonimo = () => createClient(url, publica, { auth: { persistSession: false } });

  test("sem login não chama avisar nem pedir_novo_prazo (C1/C2)", async () => {
    const { data: t } = await tarefa(gerente, { titulo: `anon-${sufixo}`, responsavel_id: vendA.id });
    const pedido = await anonimo().rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: somarDias(hoje, 5), p_motivo: "x" });
    expect(pedido.error).not.toBeNull();
    const { data } = await admin.from("tarefas").select("prazo_pedido").eq("id", t!.id).single();
    expect(data!.prazo_pedido).toBeNull();
    const aviso = await anonimo().rpc("avisar", { p_usuario: vendB.id, p_loja: loja1, p_titulo: "x", p_texto: "x", p_link: "x" });
    expect(aviso.error).not.toBeNull();
  });

  test("usuário logado não manda aviso falso (C3)", async () => {
    const { error } = await vendA.cliente.rpc("avisar", {
      p_usuario: vendB.id, p_loja: loja1, p_titulo: `falso-${sufixo}`, p_texto: "Clique", p_link: "https://evil.example",
    });
    expect(error).not.toBeNull();
    expect((await avisos(vendB)).some((a) => a.titulo === `falso-${sufixo}`)).toBe(false);
  });

  test("sem login não consulta funções auxiliares (C1)", async () => {
    expect((await anonimo().rpc("membro_da_loja", { p_usuario: vendA.id, p_loja: loja1 })).error).not.toBeNull();
  });

  test("recorrente_de emprestado é ignorado na criação (I1)", async () => {
    const { data: original } = await tarefa(gerente, { titulo: `rec-${sufixo}`, responsavel_id: vendA.id, recorrencia: "diaria" });
    const { data: intrusa } = await tarefa(vendB, { titulo: "intrusa", responsavel_id: vendB.id, recorrente_de: original!.id });
    expect(intrusa!.recorrente_de).toBeNull();
    await vendA.cliente.from("tarefas").update({ status: "feito" }).eq("id", original!.id);
    const { data } = await admin.from("tarefas").select("id").eq("recorrente_de", original!.id);
    expect(data).toHaveLength(1);
  });

  test("pedido de prazo em tarefa criada pela própria pessoa avisa a gerência (I2)", async () => {
    const { data: t } = await tarefa(vendA, { titulo: `propria-${sufixo}`, responsavel_id: vendA.id });
    await vendA.cliente.rpc("pedir_novo_prazo", { p_tarefa: t!.id, p_prazo: somarDias(hoje, 3), p_motivo: `motivo-${sufixo}` });
    expect((await avisos(gerente)).some((a) => a.texto?.includes(`motivo-${sufixo}`))).toBe(true);
  });

  test("ninguém grava direto em eventos e avisos (I5)", async () => {
    const { data: t } = await tarefa(gerente, { titulo: "ev", responsavel_id: vendA.id });
    const r = await vendA.cliente.from("tarefa_eventos").insert({ tarefa_id: t!.id, tipo: "cobranca", texto: "falsa" });
    expect(r.error?.code).toBe("42501");
  });
});
