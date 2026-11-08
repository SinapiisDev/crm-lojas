import "server-only";
import { horaSP, gerarIcs } from "@/lib/regras/reunioes";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarConviteCalendario } from "./email";

// Endereço puro do remetente ("CRM <a@b.c>" → "a@b.c"), usado como ORGANIZER.
const organizador = () => /<([^>]+)>/.exec(process.env.EMAIL_REMETENTE ?? "")?.[1] ?? process.env.EMAIL_REMETENTE ?? "";

// Um e-mail por participante (ninguém vê o e-mail dos outros). Falha fica no log; o aviso no app segue pela caixa de saída.
export async function enviarConvitesReuniao(reuniaoId: string, metodo: "REQUEST" | "CANCEL") {
  const admin = criarClienteAdmin();
  const { data: r, error } = await admin
    .from("reunioes")
    .select("id, titulo, pauta, inicio, duracao_min, local, sequencia, reuniao_participantes(perfis(email))")
    .eq("id", reuniaoId)
    .single();
  if (error || !r) return console.error("convite de reunião: não achei", reuniaoId, error);

  const emails = (r.reuniao_participantes as unknown as { perfis: { email: string } | null }[])
    .map((p) => p.perfis?.email)
    .filter((e): e is string => !!e);
  const quando = horaSP(r.inicio);
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/reunioes/${r.id}`;
  for (const email of emails) {
    const ics = gerarIcs(
      [{ id: r.id, sequencia: r.sequencia, titulo: r.titulo, descricao: r.pauta, inicio: r.inicio, duracaoMin: r.duracao_min, local: r.local, organizador: organizador(), participantes: [email] }],
      metodo,
    );
    const assunto = metodo === "CANCEL" ? `Cancelada: ${r.titulo}` : `${r.sequencia ? "Remarcada" : "Convite"}: ${r.titulo}`;
    const texto = `${r.titulo}\n${quando} (${r.duracao_min} min)${r.local ? "\nLocal: " + r.local : ""}${r.pauta ? "\n\n" + r.pauta : ""}\n\nNo CRM: ${link}`;
    try {
      await enviarConviteCalendario(email, assunto, texto, ics, metodo);
    } catch (e) {
      console.error("convite de reunião falhou", email, e);
    }
  }
}
