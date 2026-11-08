// Dados de demonstração no banco LOCAL: npm run demo  (rode depois de npm run db:reset)
// Login: dona@crm.local / crm12345 (também ana@crm.local e bruno@crm.local)
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) throw new Error("Só para o banco local.");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const SENHA = "crm12345";
const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const data = (n: number) => dia(n).slice(0, 10);

// As lojas do seed (supabase/seed.sql).
const l1 = { id: "00000000-0000-0000-0000-000000000011" };
const l2 = { id: "00000000-0000-0000-0000-000000000012" };

async function pessoa(email: string, nome: string, vinculos: [string, string][]) {
  for (const [loja_id, cargo] of vinculos) await admin.from("convites").insert({ email, loja_id, cargo });
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome } });
  if (error) throw error;
  return u.user!.id;
}

const dona = await pessoa("dona@crm.local", "Mariana Costa", [[l1.id, "dono"], [l2.id, "dono"]]);
const ana = await pessoa("ana@crm.local", "Ana Souza", [[l1.id, "vendedor"]]);
const bruno = await pessoa("bruno@crm.local", "Bruno Lima", [[l1.id, "vendedor"]]);
const carla = await pessoa("carla@crm.local", "Carla Mendes", [[l2.id, "vendedor"]]);

const lead = (loja: string, vendedor: string, nome: string, extra: object = {}) => ({ loja_id: loja, vendedor_id: vendedor, nome, telefone: "11988887777", ...extra });
await admin.from("leads").insert(
  [
    lead(l1.id, ana, "Paulo Henrique", { origem: "instagram", etapa: "negociacao", valor_estimado: 12000, temperatura: "quente", ultimo_contato_em: dia(-3), criado_em: dia(-6) }),
    lead(l1.id, ana, "Marina Lopes", { origem: "loja_fisica", etapa: "orcamento_enviado", valor_estimado: 8500, temperatura: "morno", ultimo_contato_em: dia(-1), criado_em: dia(-4) }),
    lead(l1.id, bruno, "João Pedro", { origem: "indicacao", etapa: "novo", criado_em: dia(-1) }),
    lead(l1.id, bruno, "Fernanda Alves", { origem: "prospeccao", etapa: "em_contato", valor_estimado: 4300, temperatura: "frio", criado_em: dia(-2) }),
    lead(l1.id, ana, "Rita Moraes", { origem: "instagram", etapa: "vendido", valor_vendido: 15000, criado_em: dia(-9) }),
    lead(l1.id, bruno, "Sérgio Dias", { origem: "loja_fisica", etapa: "novo", criado_em: dia(0) }),
    lead(l2.id, carla, "Beatriz Nunes", { origem: "instagram", etapa: "negociacao", valor_estimado: 29000, temperatura: "quente", ultimo_contato_em: dia(-4), criado_em: dia(-5) }),
    lead(l2.id, carla, "Otávio Reis", { origem: "indicacao", etapa: "vendido", valor_vendido: 12900, criado_em: dia(-3) }),
  ],
  { defaultToNull: false },
);

const tarefa = (loja: string, resp: string, titulo: string, prazo: string, extra: object = {}) => ({ loja_id: loja, responsavel_id: resp, titulo, prazo, ...extra });
await admin.from("tarefas").insert(
  [
    tarefa(l1.id, ana, "Mandar orçamento para o Paulo", data(-3)),
    tarefa(l1.id, ana, "Post da promoção no Instagram", data(1), { status: "fazendo" }),
    tarefa(l1.id, bruno, "Conferir estoque da vitrine", data(0)),
    tarefa(l1.id, bruno, "Fechar caixa", data(5), { recorrencia: "semanal" }),
    tarefa(l1.id, dona, "Revisar metas do mês", data(-1), { status: "feito" }),
    tarefa(l2.id, carla, "Ligar para a Beatriz", data(-1)),
  ],
  { defaultToNull: false },
);

const { data: r } = await admin
  .from("reunioes")
  .insert({ loja_id: l1.id, empresa_id: "00000000-0000-0000-0000-000000000001", titulo: "Reunião semanal de vendas", inicio: dia(1), local: "Loja 1", pauta: "Metas da semana e leads parados", criado_por: dona })
  .select("id")
  .single();
await admin.from("reuniao_participantes").insert([dona, ana, bruno].map((usuario_id) => ({ reuniao_id: r!.id, usuario_id })));
await admin.from("resumos_semanais").insert({ loja_id: l1.id, semana_inicio: data(0), texto: "Semana boa: 2 leads novos e 1 venda de R$ 15 mil. Atenção ao Paulo Henrique, parado há 3 dias em negociação, e à tarefa de orçamento da Ana, atrasada. Recomendo retomar o Paulo hoje." });
console.log("Pronto. Entre com dona@crm.local / crm12345");
