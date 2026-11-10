// Mensagens do WhatsApp: ligação com o lead pelo telefone, quem vê e contato. Exige `npm run db:start`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publica = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "w" + Date.now().toString(36);
type Usuario = { id: string; cliente: SupabaseClient };

let loja = "";
let outraLoja = "";
let gerente: Usuario;
let vendA: Usuario;
let vendB: Usuario;
let n = 0;

async function criarUsuario(nome: string, cargo: string): Promise<Usuario> {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  const cliente = createClient(url, publica, { auth: { persistSession: false } });
  await cliente.auth.signInWithPassword({ email, password: "senha-de-teste-123" });
  return { id: data.user!.id, cliente };
}

// Número único por teste, no formato do lead (com o 9) ou do WhatsApp (DDI, às vezes sem o 9).
const numero = () => String(10000000 + Date.now() % 9000000 + n++).slice(-8);
async function lead(telefone: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("leads").insert({ loja_id: loja, vendedor_id: vendA.id, nome: `WA ${sufixo}`, telefone, ...extra }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function mensagem(contato: string, extra: Record<string, unknown> = {}) {
  const id = `wamid.${sufixo}.${n++}`;
  const { error } = await admin
    .from("whatsapp_mensagens")
    .insert({ id, loja_id: loja, contato, de_cliente: true, tipo: "text", texto: "oi", enviada_em: new Date().toISOString(), ...extra });
  if (error) throw error;
  return (await admin.from("whatsapp_mensagens").select("lead_id").eq("id", id).single()).data!.lead_id as string | null;
}

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert([
      { empresa_id: "00000000-0000-0000-0000-000000000001", nome: `WA ${sufixo}` },
      { empresa_id: "00000000-0000-0000-0000-000000000001", nome: `WA fora ${sufixo}` },
    ])
    .select("id, nome");
  loja = data!.find((l) => l.nome === `WA ${sufixo}`)!.id;
  outraLoja = data!.find((l) => l.nome !== `WA ${sufixo}`)!.id;
  gerente = await criarUsuario("ger", "gerente");
  vendA = await criarUsuario("vena", "vendedor");
  vendB = await criarUsuario("venb", "vendedor");
});

describe("liga a mensagem ao lead pelo telefone", () => {
  test("lead com 9 e máscara; WhatsApp com DDI e sem o 9", async () => {
    const x = numero();
    const id = await lead(`(11) 9${x.slice(0, 4)}-${x.slice(4)}`);
    expect(await mensagem(`5511${x}`)).toBe(id);
    expect(await mensagem(`55119${x}`)).toBe(id);
  });

  test("lead cadastrado depois da mensagem também é ligado", async () => {
    const x = numero();
    expect(await mensagem(`55219${x}`)).toBeNull();
    const id = await lead(`21 9${x}`);
    const { data } = await admin.from("whatsapp_mensagens").select("lead_id").eq("contato", `55219${x}`);
    expect(data!.map((m) => m.lead_id)).toEqual([id]);
  });

  test("lead de outra loja com o mesmo telefone não é ligado", async () => {
    const x = numero();
    await admin.from("leads").insert({ loja_id: outraLoja, vendedor_id: vendA.id, nome: "fora", telefone: `11 9${x}` });
    expect(await mensagem(`55119${x}`)).toBeNull();
  });

  test("número estrangeiro não cai em lead brasileiro com dígitos parecidos", async () => {
    const x = numero().slice(-7);
    await lead(`(12) 92${x}`); // celular DDD 12: mesmos 8 últimos dígitos do número abaixo
    expect(await mensagem(`1212${x}`)).toBeNull(); // +1 212 ... (EUA): 11 dígitos, não é do Brasil
  });

  test("conversa fica no lead em que começou, mesmo com lead novo do mesmo telefone", async () => {
    const x = numero();
    const primeiro = await lead(`11 9${x}`, { etapa: "negociacao" });
    expect(await mensagem(`55119${x}`)).toBe(primeiro);
    await lead(`11 9${x}`, { etapa: "novo" }); // outro lead aberto, mais recente
    expect(await mensagem(`55119${x}`)).toBe(primeiro);
  });

  test("telefone corrigido no lead solta a conversa que não é dele", async () => {
    const x = numero();
    const errado = await lead(`11 9${x}`);
    expect(await mensagem(`55119${x}`)).toBe(errado);
    await admin.from("leads").update({ telefone: "11 90000-0000" }).eq("id", errado);
    const { data } = await admin.from("whatsapp_mensagens").select("lead_id").eq("contato", `55119${x}`);
    expect(data!.map((m) => m.lead_id)).toEqual([null]);
  });

  test("dois leads com o mesmo telefone: fica com o aberto mais recente", async () => {
    const x = numero();
    await lead(`11 9${x}`, { etapa: "perdido", motivo_perda: "preço" });
    const aberto = await lead(`11 9${x}`, { etapa: "negociacao" });
    expect(await mensagem(`55119${x}`)).toBe(aberto);
  });
});

describe("contato", () => {
  test("mensagem da loja conta como contato; a do cliente não", async () => {
    const x = numero();
    const antigo = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const id = await lead(`11 9${x}`, { ultimo_contato_em: antigo });
    await mensagem(`55119${x}`);
    const depoisCliente = (await admin.from("leads").select("ultimo_contato_em").eq("id", id).single()).data!.ultimo_contato_em;
    expect(Date.parse(depoisCliente)).toBe(Date.parse(antigo));
    await mensagem(`55119${x}`, { de_cliente: false });
    const depoisLoja = (await admin.from("leads").select("ultimo_contato_em").eq("id", id).single()).data!.ultimo_contato_em;
    expect(Date.now() - Date.parse(depoisLoja)).toBeLessThan(60_000);
  });
});

describe("quem vê", () => {
  test("vendedora do lead e gerente veem; outra vendedora não; ninguém grava pelo app", async () => {
    const x = numero();
    await lead(`11 9${x}`);
    await mensagem(`55119${x}`, { texto: "segredo do cliente" });
    const ver = (u: Usuario) => u.cliente.from("whatsapp_mensagens").select("id").eq("contato", `55119${x}`);
    expect((await ver(vendA)).data).toHaveLength(1);
    expect((await ver(gerente)).data).toHaveLength(1);
    expect((await ver(vendB)).data).toHaveLength(0);
    const { error } = await gerente.cliente
      .from("whatsapp_mensagens")
      .insert({ id: `forjada-${sufixo}`, loja_id: loja, contato: "1", de_cliente: true, tipo: "text", enviada_em: new Date().toISOString() });
    expect(error).not.toBeNull();
  });

  test("conversa sem lead só a gerência vê", async () => {
    const x = numero();
    await mensagem(`55319${x}`);
    expect((await vendA.cliente.from("whatsapp_mensagens").select("id").eq("contato", `55319${x}`)).data).toHaveLength(0);
    expect((await gerente.cliente.from("whatsapp_mensagens").select("id").eq("contato", `55319${x}`)).data).toHaveLength(1);
  });
});
