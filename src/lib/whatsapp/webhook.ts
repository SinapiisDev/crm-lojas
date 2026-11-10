import { createHmac, timingSafeEqual } from "node:crypto";

// Leitura do webhook da API oficial do WhatsApp (Cloud API, modo coexistência).
// "messages": o cliente mandou. "smb_message_echoes": a loja mandou pelo app do celular.

export type MensagemWhatsApp = {
  id: string; // wamid: chave única, evita gravar duas vezes
  numeroLoja: string; // phone_number_id do número da loja
  contato: string; // número do cliente, só dígitos com DDI
  deCliente: boolean;
  tipo: string;
  texto: string | null;
  enviadaEm: string;
};

type Bruta = { id?: unknown; from?: unknown; to?: unknown; timestamp?: unknown; type?: unknown; [k: string]: unknown };

function texto(m: Bruta): string | null {
  const tipo = String(m.type ?? "");
  const conteudo = m[tipo] as { body?: unknown; caption?: unknown } | undefined;
  const t = conteudo?.body ?? conteudo?.caption;
  // Corta por caractere (não por unidade UTF-16): emoji partido ao meio derruba a gravação do lote.
  return typeof t === "string" && t.trim() ? Array.from(t).slice(0, 4000).join("") : null;
}

function converter(m: Bruta, numeroLoja: string, deCliente: boolean): MensagemWhatsApp | null {
  const contato = String((deCliente ? m.from : m.to) ?? "").replace(/\D/g, "");
  const segundos = Number(m.timestamp);
  if (typeof m.id !== "string" || !contato || !Number.isFinite(segundos)) return null;
  return {
    id: m.id,
    numeroLoja,
    contato,
    deCliente,
    tipo: String(m.type ?? "desconhecido"),
    texto: texto(m),
    enviadaEm: new Date(segundos * 1000).toISOString(),
  };
}

// Nunca lança: corpo inesperado vira lista vazia (a Meta reenvia o que der erro, e lixo não deve travar a fila).
export function extrairMensagens(corpo: unknown): MensagemWhatsApp[] {
  const entradas = (corpo as { entry?: unknown })?.entry;
  if (!Array.isArray(entradas)) return [];
  const saida: MensagemWhatsApp[] = [];
  for (const e of entradas) {
    const mudancas = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(mudancas)) continue;
    for (const c of mudancas) {
      const { field, value } = (c ?? {}) as { field?: string; value?: Record<string, unknown> };
      const numeroLoja = String((value?.metadata as { phone_number_id?: unknown } | undefined)?.phone_number_id ?? "");
      if (!numeroLoja) continue;
      const lista = field === "messages" ? value?.messages : field === "smb_message_echoes" ? value?.message_echoes : null;
      if (!Array.isArray(lista)) continue;
      for (const m of lista) {
        const convertida = converter((m ?? {}) as Bruta, numeroLoja, field === "messages");
        if (convertida) saida.push(convertida);
      }
    }
  }
  return saida;
}

// Cabeçalho X-Hub-Signature-256 = "sha256=" + HMAC do corpo cru com o App Secret.
export function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string): boolean {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo).digest("hex"));
  const recebido = Buffer.from(cabecalho.slice(7));
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}
