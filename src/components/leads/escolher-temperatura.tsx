"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { definirTemperatura } from "@/app/(app)/leads/actions";
import { cn } from "@/lib/utils";

type Temperatura = "quente" | "morno" | "frio";
const OPCOES: { id: Temperatura; titulo: string; ativo: string }[] = [
  { id: "quente", titulo: "Quente", ativo: "bg-destructive/15 text-destructive ring-destructive/40" },
  { id: "morno", titulo: "Morno", ativo: "bg-atencao/15 text-atencao ring-atencao/40" },
  { id: "frio", titulo: "Frio", ativo: "bg-info/15 text-info ring-info/40" },
];

// Clicar na já escolhida devolve a temperatura para a IA.
export function EscolherTemperatura({ id, temperatura, manual }: { id: string; temperatura: Temperatura | null; manual: boolean }) {
  const [atual, setAtual] = useState({ temperatura, manual });
  const [, iniciar] = useTransition();

  function escolher(t: Temperatura) {
    const anterior = atual;
    const nova = atual.manual && atual.temperatura === t ? null : t;
    setAtual({ temperatura: nova, manual: nova !== null });
    iniciar(async () => {
      const r = await definirTemperatura(id, nova);
      if (r.erro) {
        setAtual(anterior);
        toast.error(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`temp-${id}`} className="text-sm font-medium">
        Temperatura
      </span>
      <div role="group" aria-labelledby={`temp-${id}`} className="flex gap-1.5">
        {OPCOES.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={atual.temperatura === o.id}
            onClick={() => escolher(o.id)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-border transition-colors",
              atual.temperatura === o.id ? o.ativo : "text-muted-foreground hover:bg-muted",
            )}
          >
            {o.titulo}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {atual.manual ? "Marcada por você · clique de novo para deixar com a IA" : atual.temperatura ? "Sugerida pela IA" : "Ainda sem temperatura"}
      </span>
    </div>
  );
}
