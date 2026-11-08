"use client";

import { AdicionarCard } from "@/components/comum/adicionar-card";
import { criarTarefaRapida } from "@/app/(app)/tarefas/actions";

export function AdicionarTarefa({ responsavelId }: { responsavelId: string }) {
  return (
    <AdicionarCard
      rotulo="Adicionar tarefa"
      placeholder="Título da tarefa (vence hoje)"
      aoAdicionar={(titulo) => criarTarefaRapida(responsavelId, titulo)}
    />
  );
}
