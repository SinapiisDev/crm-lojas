import { ModalRota } from "@/components/comum/modal-rota";
import { DetalheTarefa } from "@/components/tarefas/detalhe-tarefa";

export default async function ModalTarefa({ params }: PageProps<"/tarefas/[id]">) {
  return (
    <ModalRota titulo="Detalhe da tarefa">
      <DetalheTarefa id={(await params).id} emModal />
    </ModalRota>
  );
}
