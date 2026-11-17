// Conversa do Assistente salva no servidor e memórias confirmadas. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import type { Pessoa } from "@/lib/ia/assistente";
import { criarMemorias, enviarMensagem, gravarConversa, lerConversa, removerProposta } from "@/lib/ia/conversa";
import type { ModeloIA, PedidoIA } from "@/lib/ia/modelo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "cv" + Date.now().toString(36);
const SENHA = "senha-de-teste-123";
const HOJE = "2026-11-18";

let loja = "";
let gerenteId = "";
let vendId = "";
let email = "";
let equipe: Pessoa[] = [];

async function entrar(): Promise<SupabaseClient> {
  const c = createClient(url, publica, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: SENHA });
  return c;
}
async function criar(nome: string, cargo: string) {
  const e = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email: e, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email: e, password: SENHA, email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  return { id: data.user!.id, email: e };
}
function modeloFalso(resposta: unknown) {
  const pedidos: PedidoIA<unknown>[] = [];
  const modelo = (async (p: PedidoIA<unknown>) => {
    pedidos.push(p);
    return resposta;
  }) as ModeloIA;
  return { modelo, pedidos };
}
const vazia = { resposta: "Certo.", tarefas: [], leads: [], memorias: [] };
const ctx = () => ({ equipe, hoje: HOJE, retrato: "## Loja: Teste" });

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Conversa ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  const g = await criar("ger", "gerente");
  const v = await criar("vend", "vendedor");
  gerenteId = g.id;
  vendId = v.id;
  email = g.email;
  equipe = [
    { id: gerenteId, nome: "Gerente", cargo: "gerente", loja_id: loja, loja: "Conversa" },
    { id: vendId, nome: "Vendedora", cargo: "vendedor", loja_id: loja, loja: "Conversa" },
  ];
});

describe("conversa salva", () => {
  test("mensagem e resposta ficam salvas e aparecem em outro aparelho", async () => {
    const { modelo } = modeloFalso({ ...vazia, resposta: "Olá!" });
    const r = await enviarMensagem(await entrar(), gerenteId, "oi", ctx(), modelo);
    expect(r).toMatchObject({ mensagens: [{ autor: "voce", texto: "oi" }, { autor: "ia", texto: "Olá!" }] });
    const outro = await lerConversa(await entrar(), gerenteId, equipe, HOJE);
    expect(outro.mensagens.map((m) => m.texto)).toEqual(["oi", "Olá!"]);
  });

  test("guarda até 40 mensagens e manda só as últimas 20 para a IA", async () => {
    const c = await entrar();
    const antigas = Array.from({ length: 44 }, (_, i) => ({ autor: i % 2 ? ("ia" as const) : ("voce" as const), texto: `m${i}` }));
    await gravarConversa(c, gerenteId, { mensagens: antigas, tarefas: [], leads: [], memorias: [] });
    const { modelo, pedidos } = modeloFalso(vazia);
    await enviarMensagem(c, gerenteId, "nova", ctx(), modelo);
    expect((await lerConversa(c, gerenteId, equipe, HOJE)).mensagens).toHaveLength(40);
    expect(pedidos[0].conteudo.match(/^(Chefe|Assistente): /gm)).toHaveLength(20);
    expect(pedidos[0].conteudo).toContain("## Loja: Teste");
  });

  test("tirar proposta fica gravado; proposta de quem saiu da loja some", async () => {
    const c = await entrar();
    const tarefa = { responsavel_id: vendId, loja_id: loja, titulo: "Ligar pro Paulo", descricao: "", prazo: "2026-11-20" };
    const { modelo } = modeloFalso({ ...vazia, tarefas: [tarefa, { ...tarefa, titulo: "Mandar orçamento" }] });
    await enviarMensagem(c, gerenteId, "duas tarefas", ctx(), modelo);
    await removerProposta(c, gerenteId, "tarefa", 0, { equipe, hoje: HOJE });
    expect((await lerConversa(c, gerenteId, equipe, HOJE)).tarefas.map((t) => t.titulo)).toEqual(["Mandar orçamento"]);
    const semVendedora = equipe.filter((p) => p.id !== vendId);
    expect((await lerConversa(c, gerenteId, semVendedora, HOJE)).tarefas).toEqual([]);
  });

  test("falha da IA devolve erro e mantém a mensagem da dona", async () => {
    const c = await entrar();
    const modelo = (async () => null) as ModeloIA;
    const r = await enviarMensagem(c, gerenteId, "pergunta sem resposta", ctx(), modelo);
    expect(r).toEqual({ erro: "A IA não respondeu agora. Tente de novo em instantes." });
    expect((await lerConversa(c, gerenteId, equipe, HOJE)).mensagens.at(-1)).toEqual({ autor: "voce", texto: "pergunta sem resposta" });
  });

  test("mensagem vazia ou longa demais não chama a IA", async () => {
    const { modelo, pedidos } = modeloFalso(vazia);
    expect(await enviarMensagem(await entrar(), gerenteId, "   ", ctx(), modelo)).toHaveProperty("erro");
    expect(await enviarMensagem(await entrar(), gerenteId, "a".repeat(2001), ctx(), modelo)).toHaveProperty("erro");
    expect(pedidos).toHaveLength(0);
  });
});

describe("memórias", () => {
  test("até 30 por loja: a 31ª falha pedindo para apagar alguma", async () => {
    await admin.from("memorias_ia").insert(Array.from({ length: 29 }, (_, i) => ({ loja_id: loja, texto: `regra ${i}`, criado_por: gerenteId })));
    const r = await criarMemorias(await entrar(), gerenteId, [
      { loja_id: loja, texto: "regra 30", loja: "Conversa" },
      { loja_id: loja, texto: "regra 31", loja: "Conversa" },
    ]);
    expect(r.criadas).toBe(1);
    expect(r.falhas).toEqual([expect.stringContaining("apague alguma antes")]);
  });
});
