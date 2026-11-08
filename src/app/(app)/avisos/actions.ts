"use server";

import { obterSessao } from "@/lib/sessao";
import { endpointPermitido } from "@/lib/regras/push";
import { criarClienteAdmin } from "@/lib/supabase/admin";

type Inscricao = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function salvarInscricao(inscricao: Inscricao): Promise<{ erro?: string }> {
  const { usuario } = await obterSessao();
  const { endpoint, keys } = inscricao;
  if (!endpoint || !keys?.p256dh || !keys.auth || !endpointPermitido(endpoint)) {
    console.warn("inscrição de push recusada", URL.parse(endpoint ?? "")?.hostname ?? "(endpoint inválido)");
    return { erro: "Este navegador não é compatível com as notificações. Os avisos chegam por e-mail." };
  }
  // Aparelho que troca de login passa a avisar a pessoa nova.
  const { error } = await criarClienteAdmin()
    .from("push_inscricoes")
    .upsert({ usuario_id: usuario.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  return error ? { erro: "Não foi possível ativar." } : {};
}

export async function removerInscricao(endpoint: string) {
  const { supabase } = await obterSessao();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
}
