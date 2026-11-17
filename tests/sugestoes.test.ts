// Sugestões do dia: geradas na primeira abertura do Assistente no dia, uma vez por loja. Exige `npm run db:start`.
import { createClient } from "@supabase/supabase-js";
import { beforeAll, expect, test } from "vitest";
import type { ModeloIA, PedidoIA } from "@/lib/ia/modelo";
import { SISTEMA_SUGESTOES, sugestoesDoDia } from "@/lib/ia/sugestoes";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "sg" + Date.now().toString(36);
let loja = { id: "", nome: "", dias_lead_parado: 2 };

function modeloFalso(resposta: unknown) {
  const pedidos: PedidoIA<unknown>[] = [];
  const modelo = (async (p: PedidoIA<unknown>) => {
    pedidos.push(p);
    return resposta;
  }) as ModeloIA;
  return { modelo, pedidos };
}
const item = (i: number) => ({ texto: `Notei ${i}`, pedido: `Cria uma tarefa ${i}` });

beforeAll(async () => {
  const nome = `Sugestões ${sufixo}`;
  const { data } = await admin.from("lojas").insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome }).select("id").single();
  loja = { id: data!.id, nome, dias_lead_parado: 2 };
});

test("gera uma vez por loja e dia, no máximo 3, com o retrato da loja", async () => {
  const { modelo, pedidos } = modeloFalso({ itens: [1, 2, 3, 4, 5].map(item) });
  const r = await sugestoesDoDia(loja, "2026-11-18", modelo);
  expect(r).toEqual([item(1), item(2), item(3)]);
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].sistema).toBe(SISTEMA_SUGESTOES);
  expect(pedidos[0].conteudo).toContain(`## Loja: ${loja.nome}`);

  const denovo = await sugestoesDoDia(loja, "2026-11-18", modelo);
  expect(denovo).toEqual(r);
  expect(pedidos).toHaveLength(1);
});

test("corta textos longos", async () => {
  const { modelo } = modeloFalso({ itens: [{ texto: "a".repeat(250), pedido: "b".repeat(350) }] });
  const [s] = await sugestoesDoDia(loja, "2026-11-19", modelo);
  expect(s.texto).toHaveLength(200);
  expect(s.pedido).toHaveLength(300);
});

test("falha da IA não grava nada (tenta de novo na próxima abertura)", async () => {
  const falha = (async () => null) as ModeloIA;
  expect(await sugestoesDoDia(loja, "2026-11-20", falha)).toEqual([]);
  const { data } = await admin.from("sugestoes_ia").select("id").eq("loja_id", loja.id).eq("dia", "2026-11-20");
  expect(data).toEqual([]);
});
