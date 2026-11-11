import { notFound } from "next/navigation";
import { iaLigada } from "@/lib/ia/modelo";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { ChatAssistente } from "./chat";

export default async function PaginaAssistente() {
  const { usuario, lojas } = await obterSessao();
  if (!lojas.some((l) => podeGerir(l.cargo))) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Escreva o que cada pessoa precisa fazer ou conte de um cliente novo. A IA monta as tarefas e os leads (já na coluna certa) e você confirma antes de criar.
        </p>
      </div>
      {iaLigada() ? (
        <ChatAssistente primeiroNome={usuario.nome.split(" ")[0]} />
      ) : (
        <p className="rounded-3xl bg-card p-5 text-sm text-muted-foreground shadow-card">
          A IA está desligada. Para ligar, configure <code>ANTHROPIC_API_KEY</code> e <code>AI_MODEL</code> no servidor.
        </p>
      )}
    </div>
  );
}
