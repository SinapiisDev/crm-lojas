import { despacharAvisos } from "@/lib/avisos/despachar";
import { segredoValido } from "@/lib/avisos/segredo";

// Chamada pelo pg_cron (pg_net) a cada minuto quando há aviso pendente.
export async function POST(request: Request) {
  if (!segredoValido(request)) return new Response("Não autorizado", { status: 401 });
  return Response.json(await despacharAvisos());
}
