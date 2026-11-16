"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { mudarTipo } from "@/app/(app)/leads/actions";
import { TIPOS, type TipoLead } from "@/lib/regras/leads";

export function MudarTipo({ id, tipo }: { id: string; tipo: TipoLead }) {
  const [salvando, iniciar] = useTransition();
  return (
    <select
      aria-label="Tipo do lead"
      defaultValue={tipo}
      disabled={salvando}
      onChange={(e) => {
        const novo = e.target.value as TipoLead;
        iniciar(async () => {
          const r = await mudarTipo(id, novo);
          if (r.erro) toast.error(r.erro);
        });
      }}
      className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
    >
      {TIPOS.map((t) => (
        <option key={t.id} value={t.id}>
          {t.id === "cliente" ? "Cliente" : "Parceiro"}
        </option>
      ))}
    </select>
  );
}
