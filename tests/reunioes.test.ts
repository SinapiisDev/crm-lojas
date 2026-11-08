// Reuniões: criação, participantes, ata, remarcação, lembrete e token de agenda. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "r" + Date.now().toString(36);
type Usuario = { id: string; cliente: SupabaseClient };

let loja = "";
let outraLoja = "";
let gerente: Usuario;
let vendA: Usuario;
let vendB: Usuario;
let deFora: Usuario;

async function criarUsuario(nome: string, loja_id: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: "senha-de-teste-123" });
  return { id: data.user!.id, cliente };
}

const daquiA = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

function criar(quem: Usuario, extra: Record<string, unknown> = {}) {
  return quem.cliente.rpc("criar_reuniao", {
    p_loja: loja,
    p_titulo: `Reunião ${sufixo}`,
    p_pauta: "Metas da semana",
    p_inicio: daquiA(24 * 60),
    p_duracao: 60,
    p_local: "Loja",
    p_participantes: [vendA.id],
    ...extra,
  });
}

beforeAll(async () => {
  const novas = await admin
    .from("lojas")
    .insert([
      { empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Reun ${sufixo}` },
      { empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Reun fora ${sufixo}` },
    ])
    .select("id, nome");
  loja = novas.data!.find((l) => l.nome === `Reun ${sufixo}`)!.id;
  outraLoja = novas.data!.find((l) => l.nome !== `Reun ${sufixo}`)!.id;
  gerente = await criarUsuario("ger", loja, "gerente");
  vendA = await criarUsuario("vena", loja, "vendedor");
  vendB = await criarUsuario("venb", loja, "vendedor");
  deFora = await criarUsuario("fora", outraLoja, "vendedor");
});

describe("criar", () => {
  test("gerente cria; todos da loja veem; outra loja não", async () => {
    const { data: id, error } = await criar(gerente);
    expect(error).toBeNull();
    for (const u of [vendA, vendB]) expect((await u.cliente.from("reunioes").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await deFora.cliente.from("reunioes").select("id").eq("id", id)).data).toHaveLength(0);
    const { data: p } = await admin.from("reuniao_participantes").select("usuario_id").eq("reuniao_id", id);
    expect(p!.map((x) => x.usuario_id).sort()).toEqual([gerente.id, vendA.id].sort());
  });

  test("vendedora não cria", async () => {
    expect((await criar(vendA)).error).not.toBeNull();
    expect((await vendA.cliente.from("reunioes").insert({ loja_id: loja, titulo: "x", inicio: daquiA(60) })).error).not.toBeNull();
  });

  test("participante de outra loja é recusado", async () => {
    expect((await criar(gerente, { p_participantes: [vendA.id, deFora.id] })).error).not.toBeNull();
  });

  test("participantes recebem aviso de nova reunião", async () => {
    await criar(gerente, { p_titulo: `Aviso ${sufixo}` });
    const { data } = await vendA.cliente.from("notificacoes").select("titulo, texto");
    expect(data!.some((n) => n.titulo === "Nova reunião" && n.texto?.includes(`Aviso ${sufixo}`))).toBe(true);
  });
});

describe("registrar e remarcar", () => {
  test("registrar exige ata quando aconteceu; participante registra", async () => {
    const { data: id } = await criar(gerente);
    expect((await vendA.cliente.rpc("registrar_reuniao", { p_reuniao: id, p_aconteceu: true, p_ata: "  " })).error).not.toBeNull();
    expect((await vendA.cliente.rpc("registrar_reuniao", { p_reuniao: id, p_aconteceu: true, p_ata: "Meta: 10 vendas" })).error).toBeNull();
    const { data } = await admin.from("reunioes").select("aconteceu, ata, registrada_por").eq("id", id).single();
    expect(data).toEqual({ aconteceu: true, ata: "Meta: 10 vendas", registrada_por: vendA.id });
  });

  test("vendedora que não participa não registra", async () => {
    const { data: id } = await criar(gerente);
    expect((await vendB.cliente.rpc("registrar_reuniao", { p_reuniao: id, p_aconteceu: false, p_ata: null })).error).not.toBeNull();
  });

  test("remarcar sobe a sequência; vendedora não remarca", async () => {
    const { data: id } = await criar(gerente);
    expect((await vendA.cliente.rpc("remarcar_reuniao", { p_reuniao: id, p_inicio: daquiA(48 * 60), p_duracao: 30 })).error).not.toBeNull();
    expect((await gerente.cliente.rpc("remarcar_reuniao", { p_reuniao: id, p_inicio: daquiA(48 * 60), p_duracao: 30 })).error).toBeNull();
    const { data } = await admin.from("reunioes").select("sequencia, duracao_min").eq("id", id).single();
    expect(data).toEqual({ sequencia: 1, duracao_min: 30 });
  });

  test("cliente não grava direto na reunião", async () => {
    const { data: id } = await criar(gerente);
    const r = await gerente.cliente.from("reunioes").update({ ata: "forjada" }).eq("id", id).select("id");
    expect(r.error !== null || (r.data ?? []).length === 0).toBe(true);
  });
});

describe("lembrete e agenda", () => {
  test("lembrete 1 h antes, uma vez por participante", async () => {
    const { data: id } = await criar(gerente, { p_titulo: `Lembrete ${sufixo}`, p_inicio: daquiA(40) });
    await admin.rpc("lembrar_reunioes");
    await admin.rpc("lembrar_reunioes");
    const { data } = await admin.from("notificacoes").select("usuario_id").eq("titulo", "Reunião em 1 hora").like("link", `%${id}`);
    expect(data!.map((n) => n.usuario_id).sort()).toEqual([gerente.id, vendA.id].sort());
  });

  test("cada pessoa tem token de agenda próprio e não lê o dos outros", async () => {
    const { data: token } = await vendA.cliente.rpc("meu_token_agenda");
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect((await vendA.cliente.rpc("meu_token_agenda")).data).toBe(token);
    await gerente.cliente.rpc("meu_token_agenda");
    const { data: visiveis } = await vendA.cliente.from("agenda_tokens").select("usuario_id");
    expect(visiveis).toEqual([{ usuario_id: vendA.id }]);
  });

  test("sem login não chama nada", async () => {
    const anon = createClient(url, publica, { auth: { persistSession: false } });
    expect((await anon.rpc("criar_reuniao", { p_loja: loja, p_titulo: "x", p_pauta: null, p_inicio: daquiA(60), p_duracao: 60, p_local: null, p_participantes: [] })).error).not.toBeNull();
    expect((await anon.rpc("lembrar_reunioes")).error).not.toBeNull();
    expect((await vendA.cliente.rpc("lembrar_reunioes")).error).not.toBeNull();
  });
});
