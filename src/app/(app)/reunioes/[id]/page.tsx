import { DetalheReuniao } from "@/components/reunioes/detalhe-reuniao";

export default async function PaginaReuniao({ params }: PageProps<"/reunioes/[id]">) {
  return <DetalheReuniao id={(await params).id} />;
}
