"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { mudarStatus } from "@/app/(app)/tarefas/actions";
import { STATUS_TAREFA, type StatusTarefa } from "@/lib/regras/tarefas";

export function MudarStatus({ id, status, pode }: { id: string; status: StatusTarefa; pode: boolean }) {
  const [atual, setAtual] = useState(status);
  const [salvando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="status" className="text-sm font-medium">
        Status
      </label>
      <select
        id="status"
        className="h-9 rounded-xl border border-input bg-card px-3 text-sm"
        value={atual}
        disabled={!pode || salvando}
        onChange={(e) => {
          const novo = e.target.value as StatusTarefa;
          const anterior = atual;
          setAtual(novo);
          iniciar(async () => {
            const r = await mudarStatus(id, novo);
            if (r.erro) {
              setAtual(anterior);
              toast.error(r.erro);
            }
          });
        }}
      >
        {STATUS_TAREFA.map((s) => (
          <option key={s.id} value={s.id}>
            {s.titulo}
          </option>
        ))}
      </select>
    </div>
  );
}
