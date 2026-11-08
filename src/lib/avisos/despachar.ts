import "server-only";
import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "./email";

type Aviso = { id: string; usuario_id: string; titulo: string; texto: string | null; link: string | null };
type Inscricao = { id: string; usuario_id: string; endpoint: string; p256dh: string; auth: string };

let vapidPronto = false;

// Envia os avisos pendentes: push para quem ativou em algum aparelho; senão, e-mail.
// `reservar_avisos` marca o lote antes do envio, então dois despachos ao mesmo tempo não repetem aviso.
export async function despacharAvisos(): Promise<{ push: number; email: number }> {
  const admin = criarClienteAdmin();
  const { data, error } = await admin.rpc("reservar_avisos", { p_limite: 200 });
  if (error) throw error;
  const avisos = (data ?? []) as Aviso[];
  if (!avisos.length) return { push: 0, email: 0 };

  if (!vapidPronto) {
    setVapidDetails(process.env.VAPID_ASSUNTO!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidPronto = true;
  }

  const usuarios = [...new Set(avisos.map((a) => a.usuario_id))];
  const [{ data: inscricoes }, { data: perfis }] = await Promise.all([
    admin.from("push_inscricoes").select("id, usuario_id, endpoint, p256dh, auth").in("usuario_id", usuarios),
    admin.from("perfis").select("id, email").in("id", usuarios),
  ]);
  const vivas = new Map<string, Inscricao>((inscricoes ?? []).map((i) => [i.id, i]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let push = 0;
  let email = 0;

  for (const a of avisos) {
    let entregue = false;
    for (const i of [...vivas.values()].filter((x) => x.usuario_id === a.usuario_id)) {
      try {
        await sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify({ titulo: a.titulo, texto: a.texto, link: a.link ?? "/avisos" }),
          { TTL: 86_400 },
        );
        entregue = true;
        push++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          vivas.delete(i.id);
          await admin.from("push_inscricoes").delete().eq("id", i.id);
        } else {
          console.error("push falhou", i.endpoint, e);
        }
      }
    }
    if (entregue) continue;
    const destino = perfis?.find((p) => p.id === a.usuario_id)?.email;
    if (!destino) continue;
    try {
      await enviarEmail(destino, a.titulo, a.texto, site + (a.link ?? "/avisos"));
      email++;
    } catch (e) {
      console.error("e-mail falhou", destino, e);
    }
  }
  return { push, email };
}
