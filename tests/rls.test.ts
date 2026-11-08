// Testes de acesso no banco (RLS). Exigem `npm run db:start` rodando.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const sufixo = Date.now().toString(36);
const SENHA = "senha-de-teste-123";
let loja1 = "";
let loja2 = "";

type Cargo = "dono" | "gerente" | "vendedor" | "conferente";

async function criarUsuario(nome: string, vinculos: [string, Cargo][]) {
  const email = `${nome}-${sufixo}@teste.local`;
  for (const [loja_id, cargo] of vinculos) {
    const { error } = await admin.from("convites").insert({ email, loja_id, cargo });
    if (error) throw error;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  const login = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (login.error) throw login.error;
  return { id: data.user!.id, cliente };
}

async function criarLead(loja_id: string, vendedor_id: string, nome: string) {
  const { data, error } = await admin
    .from("leads")
    .insert({ loja_id, vendedor_id, nome, telefone: "11988887777", origem: "loja_fisica" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function nomesVisiveis(cliente: SupabaseClient) {
  const { data, error } = await cliente.from("leads").select("nome");
  if (error) throw error;
  return data.map((l) => l.nome).filter((n: string) => n.endsWith(sufixo)).sort();
}

let vendA: Awaited<ReturnType<typeof criarUsuario>>;
let vendB: Awaited<ReturnType<typeof criarUsuario>>;
let gerente: Awaited<ReturnType<typeof criarUsuario>>;
let conferente: Awaited<ReturnType<typeof criarUsuario>>;
let dono: Awaited<ReturnType<typeof criarUsuario>>;

beforeAll(async () => {
  const { data, error } = await admin.from("lojas").select("id, nome").order("nome");
  if (error) throw error;
  loja1 = data.find((l) => l.nome === "Loja 1")!.id;
  loja2 = data.find((l) => l.nome === "Loja 2")!.id;

  vendA = await criarUsuario("venda", [[loja1, "vendedor"]]);
  vendB = await criarUsuario("vendb", [[loja1, "vendedor"]]);
  gerente = await criarUsuario("gerente", [[loja1, "gerente"]]);
  conferente = await criarUsuario("conferente", [[loja1, "conferente"]]);
  dono = await criarUsuario("dono", [[loja1, "dono"], [loja2, "dono"]]);
  const vendL2 = await criarUsuario("vendl2", [[loja2, "vendedor"]]);

  await criarLead(loja1, vendA.id, `lead-a-${sufixo}`);
  await criarLead(loja1, vendB.id, `lead-b-${sufixo}`);
  await criarLead(loja2, vendL2.id, `lead-l2-${sufixo}`);
});

describe("acesso a leads", () => {
  test("vendedora vê só os próprios leads", async () => {
    expect(await nomesVisiveis(vendA.cliente)).toEqual([`lead-a-${sufixo}`]);
  });

  test("gerente vê todos os leads da loja e nenhum da outra", async () => {
    expect(await nomesVisiveis(gerente.cliente)).toEqual([`lead-a-${sufixo}`, `lead-b-${sufixo}`]);
  });

  test("conferente não vê leads", async () => {
    expect(await nomesVisiveis(conferente.cliente)).toEqual([]);
  });

  test("dono de duas lojas vê leads das duas", async () => {
    expect(await nomesVisiveis(dono.cliente)).toEqual([
      `lead-a-${sufixo}`,
      `lead-b-${sufixo}`,
      `lead-l2-${sufixo}`,
    ]);
  });

  test("vendedora não muda lead da colega", async () => {
    const { data } = await vendA.cliente
      .from("leads")
      .update({ etapa: "em_contato" })
      .eq("nome", `lead-b-${sufixo}`)
      .select("id");
    expect(data).toEqual([]);
  });
});

describe("cadastro e convites", () => {
  test("cadastro sem convite falha", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: `intruso-${sufixo}@teste.local`,
      password: SENHA,
      email_confirm: true,
    });
    expect(error).not.toBeNull();
  });

  test("gerente não convida para loja alheia", async () => {
    const { error } = await gerente.cliente
      .from("convites")
      .insert({ email: `x-${sufixo}@teste.local`, loja_id: loja2, cargo: "vendedor" });
    expect(error).not.toBeNull();
  });

  test("gerente não convida dono", async () => {
    const { error } = await gerente.cliente
      .from("convites")
      .insert({ email: `y-${sufixo}@teste.local`, loja_id: loja1, cargo: "dono" });
    expect(error).not.toBeNull();
  });

  test("vendedora não convida ninguém", async () => {
    const { error } = await vendA.cliente
      .from("convites")
      .insert({ email: `z-${sufixo}@teste.local`, loja_id: loja1, cargo: "vendedor" });
    expect(error).not.toBeNull();
  });
});

describe("regras de etapa no banco", () => {
  test("vendido sem valor é recusado", async () => {
    const { error } = await gerente.cliente
      .from("leads")
      .update({ etapa: "vendido" })
      .eq("nome", `lead-a-${sufixo}`);
    expect(error?.message).toMatch(/check/i);
  });

  test("perdido sem motivo é recusado", async () => {
    const { error } = await gerente.cliente
      .from("leads")
      .update({ etapa: "perdido" })
      .eq("nome", `lead-a-${sufixo}`);
    expect(error?.message).toMatch(/check/i);
  });
});

describe("correções da revisão", () => {
  test("estranho não toma convite pendente via signUp público (C1)", async () => {
    const email = `alvo-${sufixo}@teste.local`;
    await admin.from("convites").insert({ email, loja_id: loja1, cargo: "gerente" });
    const anonimo = createClient(url, publica, { auth: { persistSession: false } });
    const { data, error } = await anonimo.auth.signUp({ email, password: "senha-do-intruso-1" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  test("gerente não rebaixa o dono por convite (C2)", async () => {
    const { data: perfil } = await admin.from("perfis").select("email").eq("id", dono.id).single();
    await gerente.cliente.from("convites").insert({ email: perfil!.email, loja_id: loja1, cargo: "vendedor" });
    const { data } = await admin.from("membros").select("cargo").eq("usuario_id", dono.id).eq("loja_id", loja1).single();
    expect(data!.cargo).toBe("dono");
  });

  test("membro não altera o próprio e-mail no perfil (C3)", async () => {
    const { error } = await vendA.cliente
      .from("perfis")
      .update({ email: `novo-${sufixo}@teste.local` })
      .eq("id", vendA.id);
    expect(error).not.toBeNull();
  });

  test("membro altera o próprio nome", async () => {
    const { error } = await vendA.cliente.from("perfis").update({ nome: "Venda Nova" }).eq("id", vendA.id);
    expect(error).toBeNull();
  });

  test("vendedora não troca empresa do lead nem joga contato para o futuro (I1)", async () => {
    const { data: outra } = await admin.from("empresas").insert({ nome: `Outra ${sufixo}` }).select("id").single();
    const futuro = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await vendA.cliente
      .from("leads")
      .update({ empresa_id: outra!.id, ultimo_contato_em: futuro })
      .eq("nome", `lead-a-${sufixo}`);
    const { data } = await admin.from("leads").select("empresa_id, ultimo_contato_em").eq("nome", `lead-a-${sufixo}`).single();
    expect(data!.empresa_id).not.toBe(outra!.id);
    expect(new Date(data!.ultimo_contato_em).getTime()).toBeLessThanOrEqual(Date.now() + 5000);
  });

  test("sair de Vendido limpa o valor vendido (I2)", async () => {
    const nome = `lead-a-${sufixo}`;
    await gerente.cliente.from("leads").update({ etapa: "vendido", valor_vendido: 999 }).eq("nome", nome);
    await gerente.cliente.from("leads").update({ etapa: "negociacao" }).eq("nome", nome);
    const { data } = await admin.from("leads").select("valor_vendido").eq("nome", nome).single();
    expect(data!.valor_vendido).toBeNull();
  });

  test("sair de Perdido limpa o motivo (I2)", async () => {
    const nome = `lead-a-${sufixo}`;
    await gerente.cliente.from("leads").update({ etapa: "perdido", motivo_perda: "Preço" }).eq("nome", nome);
    await gerente.cliente.from("leads").update({ etapa: "negociacao" }).eq("nome", nome);
    const { data } = await admin.from("leads").select("motivo_perda").eq("nome", nome).single();
    expect(data!.motivo_perda).toBeNull();
  });
});

describe("data de fechamento", () => {
  test("lead que já nasce vendido recebe fechado_em", async () => {
    const { data, error } = await admin
      .from("leads")
      .insert({ loja_id: loja1, vendedor_id: vendA.id, nome: `nasce-vendido-${sufixo}`, etapa: "vendido", valor_vendido: 10 })
      .select("fechado_em")
      .single();
    expect(error).toBeNull();
    expect(data!.fechado_em).not.toBeNull();
  });
});

describe("datas do lead não são escolhidas pela vendedora (revisão Plano 3)", () => {
  test("vendedora não cria lead com criado_em/fechado_em no passado", async () => {
    const { data } = await vendA.cliente
      .from("leads")
      .insert({
        loja_id: loja1, vendedor_id: vendA.id, nome: `forjado-${sufixo}`, etapa: "vendido", valor_vendido: 999999,
        criado_em: "2020-01-02T00:00:00Z", fechado_em: "2020-01-02T00:00:00Z",
      })
      .select("criado_em, fechado_em")
      .single();
    expect(new Date(data!.criado_em).getFullYear()).toBeGreaterThan(2025);
    expect(new Date(data!.fechado_em).getFullYear()).toBeGreaterThan(2025);
  });

  test("vendedora não reescreve criado_em no update", async () => {
    const { data: antes } = await admin.from("leads").select("criado_em").eq("nome", `lead-a-${sufixo}`).single();
    await vendA.cliente.from("leads").update({ criado_em: "2020-01-02T00:00:00Z" }).eq("nome", `lead-a-${sufixo}`);
    const { data: depois } = await admin.from("leads").select("criado_em").eq("nome", `lead-a-${sufixo}`).single();
    expect(depois!.criado_em).toBe(antes!.criado_em);
  });
});
