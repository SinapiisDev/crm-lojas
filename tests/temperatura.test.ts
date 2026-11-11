// Temperatura do lead escolhida pela vendedora: vale sobre a da IA. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "t" + Date.now().toString(36);
type Usuario = { id: string; cliente: SupabaseClient };

let loja = "";
let vendA: Usuario;
let vendB: Usuario;

async function criarUsuario(nome: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: "senha-de-teste-123" });
  return { id: data.user!.id, cliente };
}

async function novoLead() {
  const { data } = await admin.from("leads").insert({ loja_id: loja, vendedor_id: vendA.id, nome: `Temp ${sufixo}` }).select("id").single();
  return data!.id as string;
}
const ler = async (id: string) => (await admin.from("leads").select("temperatura, temperatura_manual, resumo_ia").eq("id", id).single()).data;

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Temp ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  vendA = await criarUsuario("vena", "vendedor");
  vendB = await criarUsuario("venb", "vendedor");
});

describe("definir_temperatura", () => {
  test("vendedora marca a temperatura do próprio lead", async () => {
    const id = await novoLead();
    const { error } = await vendA.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: "quente" });
    expect(error).toBeNull();
    expect(await ler(id)).toMatchObject({ temperatura: "quente", temperatura_manual: true });
  });

  test("outra vendedora não marca", async () => {
    const id = await novoLead();
    const { error } = await vendB.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: "frio" });
    expect(error?.message).toBe("sem_permissao");
    expect(await ler(id)).toMatchObject({ temperatura: null, temperatura_manual: false });
  });

  test("valor inválido é recusado", async () => {
    const id = await novoLead();
    const { error } = await vendA.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: "fervendo" });
    expect(error?.message).toBe("temperatura_invalida");
  });

  test("IA não muda a temperatura marcada pela vendedora, mas atualiza o resumo", async () => {
    const id = await novoLead();
    await vendA.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: "quente" });
    await admin.from("leads").update({ temperatura: "frio", resumo_ia: "resumo novo" }).eq("id", id);
    expect(await ler(id)).toMatchObject({ temperatura: "quente", temperatura_manual: true, resumo_ia: "resumo novo" });
  });

  test("sem escolha (null) devolve para a IA", async () => {
    const id = await novoLead();
    await vendA.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: "quente" });
    await vendA.cliente.rpc("definir_temperatura", { p_lead: id, p_temperatura: null });
    expect(await ler(id)).toMatchObject({ temperatura: null, temperatura_manual: false });
    await admin.from("leads").update({ temperatura: "morno" }).eq("id", id);
    expect(await ler(id)).toMatchObject({ temperatura: "morno" });
  });

  test("cliente não grava temperatura nem a marca de manual direto na tabela", async () => {
    const id = await novoLead();
    await vendA.cliente.from("leads").update({ temperatura: "quente", temperatura_manual: true }).eq("id", id);
    expect(await ler(id)).toMatchObject({ temperatura: null, temperatura_manual: false });
  });
});
