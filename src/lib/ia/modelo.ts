import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export type PedidoIA<T> = { sistema: string; conteudo: string; formato: z.ZodType<T> };
// Nunca lança: falha, recusa ou saída inválida viram null (a ação do usuário segue sem IA).
export type ModeloIA = <T>(pedido: PedidoIA<T>) => Promise<T | null>;

// Ligada só com um modelo válido em AI_MODEL e chave; a escolha do modelo é da dona.
// Nome errado (ex.: "claude-opus-5.5") desliga em vez de falhar calado em toda chamada.
export const MODELOS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
export const iaLigada = () => MODELOS.includes(process.env.AI_MODEL ?? "") && !!process.env.ANTHROPIC_API_KEY;

export function modeloAnthropic(): ModeloIA {
  // Padrão do SDK é 10 min e 2 novas tentativas: uma chamada travada comeria a rotina inteira.
  const cliente = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return async <T,>({ sistema, conteudo, formato }: PedidoIA<T>): Promise<T | null> => {
    try {
      const r = await cliente.messages.parse({
        model: process.env.AI_MODEL!,
        max_tokens: 2000,
        system: sistema,
        messages: [{ role: "user", content: conteudo }],
        output_config: { effort: "low", format: zodOutputFormat(formato) },
      });
      if (r.stop_reason === "refusal") {
        console.warn("IA recusou", r.stop_details?.category);
        return null;
      }
      return (r.parsed_output as T | null) ?? null;
    } catch (e) {
      console.error("IA falhou", e instanceof Anthropic.APIError ? e.status : "", e);
      return null;
    }
  };
}
