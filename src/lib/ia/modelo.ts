import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export type PedidoIA<T> = { sistema: string; conteudo: string; formato: z.ZodType<T>; maxTokens?: number };
// Nunca lança: falha, recusa ou saída inválida viram null (a ação do usuário segue sem IA).
export type ModeloIA = <T>(pedido: PedidoIA<T>) => Promise<T | null>;

// Ligada só com modelo em AI_MODEL e chave; a escolha do modelo é da dona.
// Com OPENAI_API_KEY usa a OpenAI; senão a Anthropic, que exige nome da lista
// (nome errado, ex.: "claude-opus-5.5", desliga em vez de falhar calado em toda chamada).
// shortcut: na OpenAI qualquer nome vale (a lista muda muito); nome errado aparece como "IA falhou" no log.
export const MODELOS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
const usaOpenAI = () => !!process.env.OPENAI_API_KEY;
export const iaLigada = () =>
  usaOpenAI() ? !!process.env.AI_MODEL?.trim() : MODELOS.includes(process.env.AI_MODEL ?? "") && !!process.env.ANTHROPIC_API_KEY;

export const criarModelo = (): ModeloIA => (usaOpenAI() ? modeloOpenAI() : modeloAnthropic());

function modeloOpenAI(): ModeloIA {
  const cliente = new OpenAI({ timeout: 20_000, maxRetries: 1 });
  return async <T,>({ sistema, conteudo, formato, maxTokens = 2000 }: PedidoIA<T>): Promise<T | null> => {
    try {
      const r = await cliente.responses.parse({
        model: process.env.AI_MODEL!.trim(),
        instructions: sistema,
        input: conteudo,
        // Modelos com raciocínio contam o raciocínio no limite: esforço baixo deixa espaço para a resposta.
        reasoning: { effort: "low" },
        max_output_tokens: maxTokens,
        text: { format: zodTextFormat(formato, "resposta") },
      });
      // Recusa ou resposta cortada vêm sem output_parsed.
      if (r.output_parsed == null) console.warn("IA sem resposta válida", r.status, r.incomplete_details?.reason);
      return (r.output_parsed as T | null) ?? null;
    } catch (e) {
      console.error("IA falhou", e instanceof OpenAI.APIError ? e.status : "", e);
      return null;
    }
  };
}

function modeloAnthropic(): ModeloIA {
  // Padrão do SDK é 10 min e 2 novas tentativas: uma chamada travada comeria a rotina inteira.
  const cliente = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return async <T,>({ sistema, conteudo, formato, maxTokens = 2000 }: PedidoIA<T>): Promise<T | null> => {
    try {
      const r = await cliente.messages.parse({
        model: process.env.AI_MODEL!,
        max_tokens: maxTokens,
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
