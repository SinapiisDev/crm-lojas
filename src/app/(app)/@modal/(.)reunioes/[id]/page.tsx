import { ModalRota } from "@/components/comum/modal-rota";
import { DetalheReuniao } from "@/components/reunioes/detalhe-reuniao";

export default async function ModalReuniao({ params }: PageProps<"/reunioes/[id]">) {
  return (
    <ModalRota titulo="Detalhe da reunião">
      <DetalheReuniao id={(await params).id} emModal />
    </ModalRota>
  );
}
