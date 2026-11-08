import { ModalRota } from "@/components/comum/modal-rota";
import { DetalheLead } from "@/components/leads/detalhe-lead";

export default async function ModalLead({ params }: PageProps<"/leads/[id]">) {
  return (
    <ModalRota titulo="Detalhe da lead">
      <DetalheLead id={(await params).id} emModal />
    </ModalRota>
  );
}
