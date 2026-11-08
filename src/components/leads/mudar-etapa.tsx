"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { moverLead } from "@/app/(app)/leads/actions";
import { ETAPAS, type Etapa } from "@/lib/regras/leads";
import { DialogoEtapa } from "./dialogo-etapa";

export function MudarEtapa({ id, etapa }: { id: string; etapa: Etapa }) {
  const [atual, setAtual] = useState(etapa);
  const [pendente, setPendente] = useState<"vendido" | "perdido" | null>(null);
  const [salvando, iniciar] = useTransition();

  function mover(destino: Etapa, extras = {}) {
    const anterior = atual;
    setAtual(destino);
    iniciar(async () => {
      const r = await moverLead(id, destino, extras);
      if (r.erro) {
        setAtual(anterior);
        toast.error(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="etapa" className="text-sm font-medium">
        Etapa
      </label>
      <select
        id="etapa"
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={atual}
        disabled={salvando}
        onChange={(e) => {
          const destino = e.target.value as Etapa;
          if (destino === "vendido" || destino === "perdido") setPendente(destino);
          else mover(destino);
        }}
      >
        {ETAPAS.map((e) => (
          <option key={e.id} value={e.id}>
            {e.titulo}
          </option>
        ))}
      </select>
      <DialogoEtapa
        etapa={pendente}
        onCancelar={() => setPendente(null)}
        onConfirmar={(extras) => {
          mover(pendente!, extras);
          setPendente(null);
        }}
      />
    </div>
  );
}
