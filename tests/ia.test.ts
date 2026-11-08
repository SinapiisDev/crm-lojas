// IA: colunas protegidas, resumos semanais e núcleo com modelo falso. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "i" + Date.now().toString(36);
type Usuario = { id: string; cliente: SupabaseClient };

let loja = "";
let gerente: Usuario;
let vend: Usuario;

async function criarUsuario(nome: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: "senha-de-teste-123" });
  return { id: data.user!.id, cliente };
}

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `IA ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  gerente = await criarUsuario("ger", "gerente");
  vend = await criarUsuario("vend", "vendedor");
});

describe("banco", () => {
  test("cliente não grava colunas de IA", async () => {
    const { data: criado } = await vend.cliente
      .from("leads")
      .insert({ loja_id: loja, vendedor_id: vend.id, nome: `ia-${sufixo}`, temperatura: "quente", resumo_ia: "forjado", sugestao_ia: "forjada" })
      .select("id, temperatura, resumo_ia, sugestao_ia")
      .single();
    expect(criado).toMatchObject({ temperatura: null, resumo_ia: null, sugestao_ia: null });
    await admin.from("leads").update({ temperatura: "frio", resumo_ia: "real", sugestao_ia: "real" }).eq("id", criado!.id);
    await vend.cliente.from("leads").update({ temperatura: "quente", resumo_ia: "forjado" }).eq("id", criado!.id);
    const { data } = await admin.from("leads").select("temperatura, resumo_ia, sugestao_ia").eq("id", criado!.id).single();
    expect(data).toEqual({ temperatura: "frio", resumo_ia: "real", sugestao_ia: "real" });
  });

  test("aviso de lead parado usa o resumo da IA quando existe", async () => {
    const nome = `Resumo ${sufixo}`;
    await admin.from("leads").insert({
      loja_id: loja, vendedor_id: vend.id, nome, etapa: "negociacao", resumo_ia: "Achou caro; quer parcelar.",
      ultimo_contato_em: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    await admin.rpc("rotina_diaria");
    const { data } = await vend.cliente.from("notificacoes").select("texto").eq("titulo", `Lead parado: ${nome}`);
    expect(data).toEqual([{ texto: "Sem contato há 3 dias. Achou caro; quer parcelar." }]);
  });

  test("resumo semanal: um por loja e semana, visível só para a gerência", async () => {
    const linha = { loja_id: loja, semana_inicio: "2026-11-09", texto: "Semana boa." };
    expect((await admin.from("resumos_semanais").insert(linha)).error).toBeNull();
    expect((await admin.from("resumos_semanais").insert(linha)).error).not.toBeNull();
    expect((await gerente.cliente.from("resumos_semanais").select("texto").eq("loja_id", loja)).data).toEqual([{ texto: "Semana boa." }]);
    expect((await vend.cliente.from("resumos_semanais").select("texto").eq("loja_id", loja)).data).toEqual([]);
    expect((await gerente.cliente.from("resumos_semanais").insert({ ...linha, semana_inicio: "2026-11-16" })).error).not.toBeNull();
  });
});
