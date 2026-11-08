import { criarClienteAdmin } from "@/lib/supabase/admin";

// Pública e sem dados. Faz uma leitura real no banco: chamada 1x/dia pelo GitHub Actions
// para o Supabase grátis não pausar por inatividade.
export async function GET() {
  const { error } = await criarClienteAdmin().from("lojas").select("id").limit(1);
  if (error) console.error("saúde: banco indisponível", error);
  return Response.json({ ok: !error, banco: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
