// Reunião marcada a partir do lead: quem marca, quem vê, histórico e remarcação. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "rl" + Date.now().toString(36);
type Usuario = { id: string; cliente: SupabaseClient };

let loja = "";
let gerente: Usuario;
let vendA: Usuario;
let vendB: Usuario;
let leadA = "";

async function criarUsuario(nome: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: "senha-de-teste-123" });
  return { id: data.user!.id, cliente };
}

const daquiA = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

function marcar(quem: Usuario, lead: string, extra: Record<string, unknown> = {}) {
  return quem.cliente.rpc("marcar_reuniao_lead", {
    p_lead: lead,
    p_titulo: `Visita ${sufixo}`,
    p_pauta: "Levar amostras",
    p_inicio: daquiA(24 * 60),
    p_duracao: 60,
    p_local: "Casa do cliente",
    p_participantes: [],
    ...extra,
  });
}

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `RL ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  gerente = await criarUsuario("ger", "gerente");
  vendA = await criarUsuario("vena", "vendedor");
  vendB = await criarUsuario("venb", "vendedor");
  const { data: lead } = await admin
    .from("leads")
    .insert({ loja_id: loja, vendedor_id: vendA.id, nome: `Cliente ${sufixo}`, ultimo_contato_em: daquiA(-5 * 24 * 60) })
    .select("id")
    .single();
  leadA = lead!.id;
});

describe("marcar reunião do lead", () => {
  test("vendedora dona do lead marca; reunião fica ligada ao lead, com ela de participante", async () => {
    const { data: id, error } = await marcar(vendA, leadA);
    expect(error).toBeNull();
    const { data: r } = await admin.from("reunioes").select("lead_id, loja_id, criado_por").eq("id", id).single();
    expect(r).toEqual({ lead_id: leadA, loja_id: loja, criado_por: vendA.id });
    const { data: ps } = await admin.from("reuniao_participantes").select("usuario_id").eq("reuniao_id", id);
    expect(ps!.map((p) => p.usuario_id)).toEqual([vendA.id]);
  });

  test("gerente marca para o lead da vendedora: os dois participam", async () => {
    const { data: id, error } = await marcar(gerente, leadA);
    expect(error).toBeNull();
    const { data: ps } = await admin.from("reuniao_participantes").select("usuario_id").eq("reuniao_id", id);
    expect(ps!.map((p) => p.usuario_id).sort()).toEqual([gerente.id, vendA.id].sort());
  });

  test("outra vendedora não marca no lead que não é dela", async () => {
    const { error } = await marcar(vendB, leadA);
    expect(error?.message).toBe("sem_permissao");
  });

  test("registra no histórico do lead e conta como contato", async () => {
    await marcar(vendA, leadA, { p_titulo: `Hist ${sufixo}` });
    const { data: eventos } = await admin.from("lead_eventos").select("tipo, texto").eq("lead_id", leadA).eq("tipo", "reuniao");
    expect(eventos!.length).toBeGreaterThan(0);
    expect(eventos![0].texto).toMatch(/^Reunião marcada: /);
    const { data: lead } = await admin.from("leads").select("ultimo_contato_em").eq("id", leadA).single();
    expect(Date.now() - Date.parse(lead!.ultimo_contato_em)).toBeLessThan(60_000);
  });
});

describe("quem vê", () => {
  test("reunião de lead: outra vendedora da loja não vê; dona do lead e gerente veem", async () => {
    const { data: id } = await marcar(vendA, leadA, { p_titulo: `Priv ${sufixo}` });
    const ver = (u: Usuario) => u.cliente.from("reunioes").select("id").eq("id", id);
    expect((await ver(vendA)).data).toHaveLength(1);
    expect((await ver(gerente)).data).toHaveLength(1);
    expect((await ver(vendB)).data).toHaveLength(0);
    expect((await vendB.cliente.from("reuniao_participantes").select("usuario_id").eq("reuniao_id", id)).data).toHaveLength(0);
  });

  test("reunião interna continua visível para toda a loja", async () => {
    const { data: id } = await gerente.cliente.rpc("criar_reuniao", {
      p_loja: loja, p_titulo: `Interna ${sufixo}`, p_pauta: "", p_inicio: daquiA(60 * 24), p_duracao: 60, p_local: "", p_participantes: [],
    });
    expect((await vendB.cliente.from("reunioes").select("id").eq("id", id)).data).toHaveLength(1);
  });
});

describe("remarcar e cancelar", () => {
  test("quem marcou a reunião do lead remarca e cancela; outra vendedora não", async () => {
    const { data: id } = await marcar(vendA, leadA, { p_titulo: `Rem ${sufixo}` });
    expect((await vendB.cliente.rpc("remarcar_reuniao", { p_reuniao: id, p_inicio: daquiA(48 * 60), p_duracao: 30 })).error?.message).toBe(
      "sem_permissao",
    );
    expect((await vendA.cliente.rpc("remarcar_reuniao", { p_reuniao: id, p_inicio: daquiA(48 * 60), p_duracao: 30 })).error).toBeNull();
    expect((await vendA.cliente.rpc("cancelar_reuniao", { p_reuniao: id })).error).toBeNull();
    const { data } = await admin.from("reunioes").select("duracao_min, cancelada").eq("id", id).single();
    expect(data).toEqual({ duracao_min: 30, cancelada: true });
  });

  test("vendedora continua sem remarcar reunião interna", async () => {
    const { data: id } = await gerente.cliente.rpc("criar_reuniao", {
      p_loja: loja, p_titulo: `Int2 ${sufixo}`, p_pauta: "", p_inicio: daquiA(60 * 24), p_duracao: 60, p_local: "", p_participantes: [vendA.id],
    });
    expect((await vendA.cliente.rpc("cancelar_reuniao", { p_reuniao: id })).error?.message).toBe("sem_permissao");
  });
});
