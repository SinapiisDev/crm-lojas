// Rotina diária, caixa de saída de avisos e inscrições de push. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "a" + Date.now().toString(36);
const SENHA = "senha-de-teste-123";
type Usuario = { id: string; cliente: SupabaseClient };

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (n: number) => {
  const d = new Date(hoje + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let loja = "";
let gerente: Usuario;
let vend: Usuario;
let outra: Usuario;

async function criarUsuario(nome: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: SENHA });
  return { id: data.user!.id, cliente };
}

const avisosDe = async (u: Usuario) => (await u.cliente.from("notificacoes").select("id, titulo, texto, link")).data ?? [];
const rotina = async () => {
  const { error } = await admin.rpc("rotina_diaria");
  if (error) throw error;
};

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Avisos ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  gerente = await criarUsuario("ger", "gerente");
  vend = await criarUsuario("vend", "vendedor");
  outra = await criarUsuario("outra", "vendedor");
});

describe("rotina diária", () => {
  test("rotina cria aviso de lead parado para a vendedora", async () => {
    const nome = `Paulo ${sufixo}`;
    await admin.from("leads").insert({
      loja_id: loja, vendedor_id: vend.id, nome, etapa: "negociacao",
      ultimo_contato_em: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    await rotina();
    const aviso = (await avisosDe(vend)).find((a) => a.titulo === `Lead parado: ${nome}`);
    expect(aviso?.texto).toBe("Sem contato há 3 dias. Entre em contato de novo.");
    expect(aviso?.link).toMatch(/^\/leads\//);
  });

  test("véspera avisa o responsável", async () => {
    const titulo = `vespera-${sufixo}`;
    await admin.from("tarefas").insert({ loja_id: loja, responsavel_id: vend.id, titulo, prazo: somarDias(1) });
    await rotina();
    expect((await avisosDe(vend)).some((a) => a.titulo === "Tarefa vence amanhã" && a.texto === titulo)).toBe(true);
  });

  test("atraso avisa responsável e gerência", async () => {
    const titulo = `atraso-${sufixo}`;
    await admin.from("tarefas").insert({ loja_id: loja, responsavel_id: vend.id, titulo, prazo: somarDias(-1) });
    await rotina();
    for (const u of [vend, gerente]) {
      expect((await avisosDe(u)).some((a) => a.titulo === "Tarefa atrasada" && a.texto?.includes(titulo))).toBe(true);
    }
    expect((await avisosDe(outra)).some((a) => a.texto?.includes(titulo))).toBe(false);
  });

  test("rodar a rotina duas vezes não duplica", async () => {
    await rotina();
    const antes = (await avisosDe(vend)).length;
    await rotina();
    expect((await avisosDe(vend)).length).toBe(antes);
  });
});

describe("caixa de saída", () => {
  test("reservar_avisos entrega cada aviso uma vez mesmo em chamadas paralelas", async () => {
    await admin.from("tarefas").insert(
      Array.from({ length: 6 }, (_, i) => ({ loja_id: loja, responsavel_id: vend.id, titulo: `par-${i}-${sufixo}`, prazo: somarDias(5) })),
    );
    const [a, b] = await Promise.all([
      admin.rpc("reservar_avisos", { p_limite: 1000 }),
      admin.rpc("reservar_avisos", { p_limite: 1000 }),
    ]);
    const idsA = (a.data ?? []).map((n: { id: string }) => n.id);
    const idsB = (b.data ?? []).map((n: { id: string }) => n.id);
    expect(idsA.filter((id: string) => idsB.includes(id))).toEqual([]);
    const meus = (await avisosDe(vend)).filter((n) => n.texto?.includes(`-${sufixo}`) && n.texto.startsWith("par-")).map((n) => n.id);
    expect(meus.every((id) => idsA.includes(id) || idsB.includes(id))).toBe(true);
    const { data: denovo } = await admin.rpc("reservar_avisos", { p_limite: 1000 });
    expect((denovo ?? []).filter((n: { id: string }) => meus.includes(n.id))).toEqual([]);
  });

  test("cliente não chama rotina_diaria nem reservar_avisos", async () => {
    const anon = createClient(url, publica, { auth: { persistSession: false } });
    for (const c of [vend.cliente, anon]) {
      expect((await c.rpc("rotina_diaria")).error).not.toBeNull();
      expect((await c.rpc("reservar_avisos", { p_limite: 10 })).error).not.toBeNull();
    }
  });
});

describe("inscrições de push", () => {
  test("cliente não grava inscrição direto (só pela ação do servidor)", async () => {
    const r = await vend.cliente.from("push_inscricoes").insert({ usuario_id: vend.id, endpoint: `https://interno.local/${sufixo}`, p256dh: "x", auth: "y" });
    expect(r.error).not.toBeNull();
  });

  test("ninguém vê nem apaga inscrição de push alheia", async () => {
    const endpoint = `https://push.exemplo/${sufixo}`;
    expect((await admin.from("push_inscricoes").insert({ usuario_id: vend.id, endpoint, p256dh: "x", auth: "y" })).error).toBeNull();
    expect((await vend.cliente.from("push_inscricoes").select("id").eq("endpoint", endpoint)).data).toHaveLength(1);
    expect((await outra.cliente.from("push_inscricoes").select("id").eq("endpoint", endpoint)).data).toEqual([]);
    const apagou = await outra.cliente.from("push_inscricoes").delete().eq("endpoint", endpoint).select("id");
    expect(apagou.data ?? []).toEqual([]);
    const alheia = await outra.cliente.from("push_inscricoes").insert({ usuario_id: vend.id, endpoint: endpoint + "2", p256dh: "x", auth: "y" });
    expect(alheia.error).not.toBeNull();
  });
});
