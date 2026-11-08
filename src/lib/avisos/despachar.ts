import "server-only";
import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { endpointPermitido } from "@/lib/regras/push";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail } from "./email";

type Aviso = { id: string; usuario_id: string; titulo: string; texto: string | null; link: string | null };
type Inscricao = { id: string; usuario_id: string; endpoint: string; p256dh: string; auth: string };

const CONFIG = ["VAPID_ASSUNTO", "VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "SMTP_HOST", "SMTP_PORT", "EMAIL_REMETENTE", "NEXT_PUBLIC_SITE_URL"];
// Lote pequeno + prazo: cabe numa função serverless (~10 s no Netlify grátis); o resto sai no minuto seguinte.
const LOTE = 10;
export const tempoMaximo = () => Number(process.env.TEMPO_MAX_MS ?? 8000);

// Envia os avisos pendentes: push para quem ativou em algum aparelho; senão, e-mail.
// `reservar_avisos` marca o lote antes do envio (dois despachos não repetem aviso);
// o que falhar volta para a fila e o cron tenta de novo (até 24 h depois de criado).
export async function despacharAvisos({ prazo = Date.now() + tempoMaximo() } = {}): Promise<{ push: number; email: number }> {
  // Tudo que pode quebrar por configuração quebra ANTES de reservar, senão o lote se perderia.
  const faltando = CONFIG.filter((k) => !process.env[k]);
  if (faltando.length) throw new Error(`Configuração de avisos incompleta: ${faltando.join(", ")}`);
  setVapidDetails(process.env.VAPID_ASSUNTO!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const admin = criarClienteAdmin();
  const devolver = (ids: string[]) => admin.from("notificacoes").update({ enviado_em: null }).in("id", ids);
  const { data, error } = await admin.rpc("reservar_avisos", { p_limite: LOTE });
  if (error) throw error;
  const avisos = (data ?? []) as Aviso[];
  if (!avisos.length) return { push: 0, email: 0 };

  const usuarios = [...new Set(avisos.map((a) => a.usuario_id))];
  const [inscricoes, perfis] = await Promise.all([
    admin.from("push_inscricoes").select("id, usuario_id, endpoint, p256dh, auth").in("usuario_id", usuarios),
    admin.from("perfis").select("id, email").in("id", usuarios),
  ]);
  if (inscricoes.error || perfis.error) {
    await devolver(avisos.map((a) => a.id));
    throw inscricoes.error ?? perfis.error;
  }
  const vivas = new Map<string, Inscricao>((inscricoes.data ?? []).map((i) => [i.id, i]));
  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const falharam: string[] = [];
  let push = 0;
  let email = 0;

  for (const [n, a] of avisos.entries()) {
    if (Date.now() > prazo) {
      falharam.push(...avisos.slice(n).map((x) => x.id)); // sem tempo: volta para a fila
      break;
    }
    let entregue = false;
    for (const i of [...vivas.values()].filter((x) => x.usuario_id === a.usuario_id && endpointPermitidoOuTeste(x.endpoint))) {
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
    const destino = perfis.data?.find((p) => p.id === a.usuario_id)?.email;
    if (!destino) continue; // sem e-mail cadastrado não há o que tentar de novo
    try {
      await enviarEmail(destino, a.titulo, a.texto, site + (a.link ?? "/avisos"));
      email++;
    } catch (e) {
      console.error("e-mail falhou; volta para a fila", destino, e);
      falharam.push(a.id);
    }
  }
  if (falharam.length) await devolver(falharam);
  return { push, email };
}

// Defesa extra contra endpoint gravado por fora da ação; nos testes o push falso roda em 127.0.0.1.
function endpointPermitidoOuTeste(endpoint: string) {
  return endpointPermitido(endpoint) || (process.env.NODE_ENV === "test" && endpoint.startsWith("https://127.0.0.1:"));
}
