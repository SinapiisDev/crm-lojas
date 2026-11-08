import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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

const BORDA = {
  atrasada: "border-l-4 border-l-destructive",
  hoje: "border-l-4 border-l-amber-500",
  amanha: "border-l-4 border-l-amber-500",
  ok: "",
  feita: "opacity-60",
};

export function CardTarefa({ tarefa, hoje }: { tarefa: TarefaResumo; hoje: string }) {
  const situacao = situacaoPrazo(tarefa.prazo, tarefa.status, hoje);
  return (
    <Link
      href={`/tarefas/${tarefa.id}`}
      className={cn("block rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:shadow-sm", BORDA[situacao])}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-medium", situacao === "feita" && "line-through")}>
          {situacao === "feita" && "✓ "}
          {tarefa.titulo}
        </span>
        {tarefa.status === "fazendo" && <Badge variant="secondary">Fazendo</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
        <span className={cn(situacao === "atrasada" ? "text-destructive" : "text-muted-foreground")}>
          {textoPrazo(tarefa.prazo, tarefa.status, hoje)}
        </span>
        {tarefa.recorrencia && <span className="text-muted-foreground">↻ recorrente</span>}
        {tarefa.prazo_pedido && <span className="text-amber-700">prazo pedido</span>}
      </div>
    </Link>
  );
}
