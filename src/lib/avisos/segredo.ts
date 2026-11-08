import "server-only";
import { timingSafeEqual } from "node:crypto";

// Rotas chamadas pelo pg_cron: exigem `Authorization: Bearer <AVISOS_SEGREDO>`, comparado em tempo constante.
export function segredoValido(request: Request): boolean {
  const esperado = process.env.AVISOS_SEGREDO;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const certo = Buffer.from(`Bearer ${esperado}`);
  return !!esperado && recebido.length === certo.length && timingSafeEqual(recebido, certo);
}
