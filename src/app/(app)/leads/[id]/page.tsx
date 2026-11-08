import { DetalheLead } from "@/components/leads/detalhe-lead";

export default async function PaginaLead({ params }: PageProps<"/leads/[id]">) {
  return <DetalheLead id={(await params).id} />;
}
