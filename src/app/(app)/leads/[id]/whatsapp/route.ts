import { NextResponse, type NextRequest } from "next/server";
import { linkWhatsApp } from "@/lib/regras/leads";
import { criarClienteServidor } from "@/lib/supabase/server";

// Link dos avisos de lead parado: o service worker só abre páginas do CRM, então o aviso aponta para cá
// e daqui vai para o WhatsApp do lead com a sugestão atual da IA. O RLS decide quem pode ver o lead.
export async function GET(request: NextRequest, { params }: RouteContext<"/leads/[id]/whatsapp">) {
  const { id } = await params;
  const supabase = await criarClienteServidor();
  const { data: lead } = await supabase
    .from("leads")
    .select("telefone, sugestao_ia, ia_em, ultimo_contato_em, etapa")
    .eq("id", id)
    .maybeSingle();
  if (!lead) return NextResponse.redirect(new URL("/leads", request.url));
  // Mesma regra da página do lead: sugestão só vale se for depois do último contato e com o lead em aberto.
  const vale = lead.etapa !== "vendido" && lead.etapa !== "perdido" && !!lead.ia_em && lead.ia_em >= lead.ultimo_contato_em;
  const link = linkWhatsApp(lead.telefone ?? "", vale ? (lead.sugestao_ia ?? undefined) : undefined);
  return NextResponse.redirect(link ?? new URL(`/leads/${id}`, request.url));
}
