import { Check, Clock, Repeat } from "lucide-react";
import Link from "next/link";
import { Etiqueta, estiloCard } from "@/components/comum/quadro";
import { situacaoPrazo, textoPrazo, type Recorrencia, type StatusTarefa } from "@/lib/regras/tarefas";
import { cn } from "@/lib/utils";

export type TarefaResumo = {
  id: string;
  titulo: string;
  prazo: string;
  status: StatusTarefa;
  recorrencia: Recorrencia | null;
  prazo_pedido: string | null;
  responsavel_id: string;
};

export function CardTarefa({ tarefa, hoje }: { tarefa: TarefaResumo; hoje: string }) {
  const situacao = situacaoPrazo(tarefa.prazo, tarefa.status, hoje);
  const etiquetas = [
    situacao === "atrasada" && <Etiqueta key="a" cor="vermelho">Atrasada</Etiqueta>,
    (situacao === "hoje" || situacao === "amanha") && (
      <Etiqueta key="h" cor="ambar">
        {situacao === "hoje" ? "Hoje" : "Amanhã"}
      </Etiqueta>
    ),
    tarefa.status === "fazendo" && <Etiqueta key="f" cor="preto">Fazendo</Etiqueta>,
    tarefa.prazo_pedido && <Etiqueta key="p" cor="ambar">Prazo pedido</Etiqueta>,
    tarefa.recorrencia && (
      <Etiqueta key="r">
        <Repeat className="size-3" aria-hidden /> Recorrente
      </Etiqueta>
    ),
  ].filter(Boolean);

  return (
    <Link href={`/tarefas/${tarefa.id}`} className={cn(estiloCard, situacao === "feita" && "bg-card/60 shadow-none")}>
      {etiquetas.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{etiquetas}</div>}
      <p className={cn("leading-snug font-medium", situacao === "feita" && "text-muted-foreground line-through")}>
        {situacao === "feita" && <Check className="mr-1 inline size-3.5 text-sucesso" aria-label="Feita" />}
        {tarefa.titulo}
      </p>
      <p className={cn("mt-2 flex items-center gap-1 text-xs", situacao === "atrasada" ? "font-medium text-destructive" : "text-muted-foreground")}>
        <Clock className="size-3.5" aria-hidden />
        {textoPrazo(tarefa.prazo, tarefa.status, hoje)}
      </p>
    </Link>
  );
}
