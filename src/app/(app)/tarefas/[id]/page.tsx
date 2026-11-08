import Link from "next/link";
import { notFound } from "next/navigation";
import { Cobrar, DecidirPrazo, PedirPrazo } from "@/components/tarefas/acoes-tarefa";
import { MudarStatus } from "@/components/tarefas/mudar-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHora } from "@/lib/formatar";
import { RECORRENCIAS, hojeSP, mensagemCobranca, textoPrazo, type StatusTarefa } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const NOME_EVENTO: Record<string, string> = {
  criada: "Tarefa criada",
  status: "Status",
  cobranca: "Cobrança",
  prazo_pedido: "Pediu novo prazo",
  prazo_aprovado: "Novo prazo aprovado",
  prazo_recusado: "Novo prazo recusado",
  prazo_alterado: "Prazo alterado",
};

export default async function PaginaTarefa({ params }: PageProps<"/tarefas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, usuario, lojas } = await obterSessao();
  const [{ data: t }, { data: eventos }] = await Promise.all([
    supabase
      .from("tarefas")
      .select("id, loja_id, titulo, descricao, prazo, status, recorrencia, prazo_pedido, prazo_alterado_vezes, responsavel_id, perfis!tarefas_responsavel_id_fkey(nome)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("tarefa_eventos").select("id, tipo, texto, prazo, criado_em, perfis(nome)").eq("tarefa_id", id).order("criado_em", { ascending: false }),
  ]);
  if (!t) notFound();

  const hoje = hojeSP();
  const status = t.status as StatusTarefa;
  const responsavel = (t.perfis as unknown as { nome: string }).nome;
  const gere = podeGerir(lojas.find((l) => l.id === t.loja_id)?.cargo ?? "conferente");
  const souResponsavel = t.responsavel_id === usuario.id;
  const aberta = status !== "feito";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/tarefas" className="text-sm text-muted-foreground underline">
        ← Tarefas
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg">{t.titulo}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {t.descricao && <p className="whitespace-pre-line">{t.descricao}</p>}
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Responsável</dt>
            <dd>{responsavel}</dd>
            <dt className="text-muted-foreground">Prazo</dt>
            <dd>
              <span>Prazo: {ddmm(t.prazo)}</span> <span className="text-muted-foreground">({textoPrazo(t.prazo, status, hoje)})</span>
              {t.prazo_alterado_vezes > 0 && (
                <span className="block text-xs text-amber-700">
                  Prazo alterado {t.prazo_alterado_vezes} {t.prazo_alterado_vezes === 1 ? "vez" : "vezes"}
                </span>
              )}
            </dd>
            {t.recorrencia && (
              <>
                <dt className="text-muted-foreground">Repete</dt>
                <dd>{RECORRENCIAS.find((r) => r.id === t.recorrencia)?.titulo}</dd>
              </>
            )}
          </dl>

          {t.prazo_pedido && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-amber-900">
              <span>
                Prazo pedido: {ddmm(t.prazo_pedido)}
                {!gere && " · aguardando aprovação"}
              </span>
              {gere && <DecidirPrazo id={t.id} />}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <MudarStatus key={status} id={t.id} status={status} pode={gere || souResponsavel} />
            {gere && aberta && <Cobrar id={t.id} mensagem={mensagemCobranca(responsavel, t.titulo, t.prazo, hoje)} />}
            {souResponsavel && aberta && !t.prazo_pedido && <PedirPrazo id={t.id} hoje={hoje} />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 text-sm">
            {(eventos ?? []).map((e) => (
              <li key={e.id} className="border-l-2 pl-3">
                <div className="text-xs text-muted-foreground">
                  {formatarDataHora(e.criado_em)} · {(e.perfis as unknown as { nome: string } | null)?.nome ?? "Sistema"} ·{" "}
                  {NOME_EVENTO[e.tipo]}
                  {e.prazo && ` · ${ddmm(e.prazo)}`}
                </div>
                {e.texto && <p>{e.texto}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
