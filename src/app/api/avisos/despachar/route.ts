import { timingSafeEqual } from "node:crypto";
import { despacharAvisos } from "@/lib/avisos/despachar";

// Chamada pelo pg_cron (pg_net) a cada minuto quando há aviso pendente.
export async function POST(request: Request) {
  const esperado = process.env.AVISOS_SEGREDO;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const certo = Buffer.from(`Bearer ${esperado}`);
  if (!esperado || recebido.length !== certo.length || !timingSafeEqual(recebido, certo)) {
    return new Response("Não autorizado", { status: 401 });
  }
  return Response.json(await despacharAvisos());
}
