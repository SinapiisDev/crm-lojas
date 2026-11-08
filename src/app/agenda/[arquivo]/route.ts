import { gerarIcs } from "@/lib/regras/reunioes";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Feed .ics da pessoa (assinado uma vez no celular). Sem login: o token secreto é a chave.
export async function GET(_: Request, { params }: RouteContext<"/agenda/[arquivo]">) {
  const token = (await params).arquivo.replace(/\.ics$/, "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Não encontrado", { status: 404 });
  const admin = criarClienteAdmin();
  const { data: dono } = await admin.from("agenda_tokens").select("usuario_id").eq("token", token).maybeSingle();
  if (!dono) return new Response("Não encontrado", { status: 404 });

  const [{ data: vinculos }, { data: participacoes }] = await Promise.all([
    admin.from("membros").select("loja_id").eq("usuario_id", dono.usuario_id),
    admin.from("reuniao_participantes").select("reuniao_id").eq("usuario_id", dono.usuario_id),
  ]);
  const lojas = (vinculos ?? []).map((v) => v.loja_id);
  const ids = (participacoes ?? []).map((p) => p.reuniao_id);
  // Só lojas em que a pessoa ainda está; dos últimos 30 dias em diante.
  const { data: reunioes } = ids.length && lojas.length
    ? await admin
        .from("reunioes")
        .select("id, titulo, pauta, inicio, duracao_min, local, sequencia, cancelada")
        .in("id", ids)
        .in("loja_id", lojas)
        .gte("inicio", new Date(Date.now() - 30 * 86_400_000).toISOString())
    : { data: [] };

  const eventos = (reunioes ?? [])
    .filter((r) => !r.cancelada)
    .map((r) => ({ id: r.id, sequencia: r.sequencia, titulo: r.titulo, descricao: r.pauta, inicio: r.inicio, duracaoMin: r.duracao_min, local: r.local, participantes: [] }));
  return new Response(gerarIcs(eventos, "PUBLISH"), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
