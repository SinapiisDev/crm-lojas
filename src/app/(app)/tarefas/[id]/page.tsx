import { DetalheTarefa } from "@/components/tarefas/detalhe-tarefa";

export default async function PaginaTarefa({ params }: PageProps<"/tarefas/[id]">) {
  return <DetalheTarefa id={(await params).id} />;
}
