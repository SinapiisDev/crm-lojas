import { notFound } from "next/navigation";
import { lerConversa } from "@/lib/ia/conversa";
import { iaLigada } from "@/lib/ia/modelo";
import { sugestoesDoDia } from "@/lib/ia/sugestoes";
import { hojeSP } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { equipeDoAssistente } from "./actions";
import { ChatAssistente } from "./chat";
import { MemoriasDaLoja } from "./memorias";
import type { SugestaoLoja } from "./sugestoes";

export default async function PaginaAssistente() {
  const { supabase, usuario, lojas } = await obterSessao();
  if (!lojas.some((l) => podeGerir(l.cargo))) notFound();
  const hoje = hojeSP();
  const geridas = lojas.filter((l) => podeGerir(l.cargo));
  const [conversa, { data: memorias }] = await Promise.all([
    lerConversa(supabase, usuario.id, await equipeDoAssistente(), hoje),
    supabase.from("memorias_ia").select("id, texto, loja_id").in("loja_id", geridas.map((l) => l.id)).order("criado_em"),
  ]);
  const nomeLoja = (id: string) => geridas.find((l) => l.id === id)?.nome ?? "";
  // Sem await: a página aparece já e os cartões chegam quando a IA responder (só na primeira abertura do dia).
  const sugestoes: Promise<SugestaoLoja[]> = iaLigada()
    ? Promise.all(
        geridas.map(async ({ id, nome, dias_lead_parado }) =>
          (await sugestoesDoDia({ id, nome, dias_lead_parado }, hoje)).map((s) => ({ ...s, loja: nome })),
        ),
      )
        .then((porLoja) => porLoja.flat())
        .catch(() => [])
    : Promise.resolve([]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Peça tarefas, conte de um cliente novo ou pergunte sobre a loja. A IA usa os números da loja, monta tarefas e leads e você confirma antes de criar.
        </p>
      </div>
      {iaLigada() ? (
        <ChatAssistente primeiroNome={usuario.nome.split(" ")[0]} inicial={conversa} sugestoes={sugestoes} />
      ) : (
        <p className="rounded-3xl bg-card p-5 text-sm text-muted-foreground shadow-card">
          A IA está desligada. Para ligar, configure <code>OPENAI_API_KEY</code> (ou <code>ANTHROPIC_API_KEY</code>) e <code>AI_MODEL</code> no servidor.
        </p>
      )}
      <MemoriasDaLoja inicial={(memorias ?? []).map((m) => ({ id: m.id, texto: m.texto, loja: nomeLoja(m.loja_id) }))} />
    </div>
  );
}
