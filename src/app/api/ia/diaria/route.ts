import { segredoValido } from "@/lib/avisos/segredo";
import { rotinaIA } from "@/lib/ia/semana";
import { hojeSP } from "@/lib/regras/tarefas";

export const maxDuration = 300;

// Chamada pelo pg_cron às 07:45 de São Paulo. Com a IA desligada devolve zeros.
export async function POST(request: Request) {
  if (!segredoValido(request)) return new Response("Não autorizado", { status: 401 });
  return Response.json(await rotinaIA(hojeSP()));
}
