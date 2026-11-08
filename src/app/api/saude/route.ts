import { segredoValido } from "@/lib/avisos/segredo";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Sem dados na resposta. Faz uma leitura real no banco: chamada 1x/dia pelo GitHub Actions (com o segredo)
// para o Supabase grátis não pausar por inatividade. O segredo impede que terceiros gastem invocações.
export async function GET(request: Request) {
  if (!segredoValido(request)) return new Response("Não autorizado", { status: 401 });
  const { error } = await criarClienteAdmin().from("lojas").select("id").limit(1);
  if (error) console.error("saúde: banco indisponível", error);
  return Response.json({ ok: !error, banco: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
