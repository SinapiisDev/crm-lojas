import { after, type NextRequest } from "next/server";
import { atualizarLeadIA } from "@/lib/ia/leads";
import { iaLigada } from "@/lib/ia/modelo";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { assinaturaValida, extrairMensagens } from "@/lib/whatsapp/webhook";

// Webhook da API oficial do WhatsApp. GET: a Meta confere o endereço. POST: mensagens novas.

export const maxDuration = 60;
// Reanálise da IA no máximo a cada 10 min por lead: cliente que manda 30 linhas seguidas não gera 30 chamadas.
const INTERVALO_IA_MS = 10 * 60_000;

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Proibido", { status: 403 });
}

export async function POST(request: NextRequest) {
  const corpo = await request.text();
  if (!assinaturaValida(corpo, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return new Response("Não autorizado", { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const mensagens = extrairMensagens(json);
  if (!mensagens.length) return new Response("ok");

  const admin = criarClienteAdmin();
  const { data: numeros, error: erroNumeros } = await admin
    .from("whatsapp_numeros")
    .select("phone_number_id, loja_id")
    .in("phone_number_id", [...new Set(mensagens.map((m) => m.numeroLoja))]);
  // Falha passageira não pode virar "número desconhecido" com 200: a Meta não reenviaria e a mensagem se perderia.
  if (erroNumeros) {
    console.error("ler números do WhatsApp falhou", erroNumeros);
    return new Response("erro", { status: 500 });
  }
  // Número que não é de nenhuma loja cadastrada: ignora (200, para a Meta não reenviar).
  const linhas = mensagens.flatMap((m) => {
    const loja = numeros?.find((n) => n.phone_number_id === m.numeroLoja)?.loja_id;
    return loja
      ? [{ id: m.id, loja_id: loja, contato: m.contato, de_cliente: m.deCliente, tipo: m.tipo, texto: m.texto, enviada_em: m.enviadaEm }]
      : [];
  });
  if (!linhas.length) return new Response("ok");

  const { data, error } = await admin.from("whatsapp_mensagens").upsert(linhas, { onConflict: "id", ignoreDuplicates: true }).select("lead_id");
  // Erro: 500 faz a Meta reenviar depois; o id (wamid) impede duplicar.
  if (error) {
    console.error("gravar mensagens do WhatsApp falhou", error);
    return new Response("erro", { status: 500 });
  }
  // IA relê a conversa dos leads abertos tocados (desligada: não faz nada), em paralelo e com intervalo mínimo.
  const tocados = [...new Set((data ?? []).map((m) => m.lead_id).filter((id): id is string => !!id))].slice(0, 5);
  if (tocados.length && iaLigada()) {
    after(async () => {
      const { data: leads } = await admin.from("leads").select("id, etapa, ia_em").in("id", tocados);
      const analisar = (leads ?? []).filter(
        (l) => !["vendido", "perdido"].includes(l.etapa) && (!l.ia_em || Date.now() - Date.parse(l.ia_em) > INTERVALO_IA_MS),
      );
      await Promise.allSettled(analisar.map((l) => atualizarLeadIA(l.id)));
    });
  }
  return new Response("ok");
}
