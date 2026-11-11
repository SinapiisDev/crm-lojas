import Link from "next/link";
import { notFound } from "next/navigation";
import { Cancelar, RegistrarReuniao, Remarcar } from "@/components/reunioes/acoes-reuniao";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { horaSP, situacaoReuniao } from "@/lib/regras/reunioes";
import { obterSessao, podeGerir } from "@/lib/sessao";

const jaComecou = (inicio: string) => Date.parse(inicio) <= Date.now();

const ROTULO = {
  proxima: "Próxima",
  agora: "Acontecendo agora",
  aguardando: "Aguardando registro",
  sem_registro: "Sem registro",
  aconteceu: "Aconteceu",
  nao_aconteceu: "Não aconteceu",
  cancelada: "Cancelada",
};

// Conteúdo do detalhe: página inteira ou janela por cima do quadro (emModal).
export async function DetalheReuniao({ id, emModal = false }: { id: string; emModal?: boolean }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, usuario, lojas } = await obterSessao();
  const { data: r } = await supabase
    .from("reunioes")
    .select("id, loja_id, lead_id, criado_por, titulo, pauta, inicio, duracao_min, local, cancelada, aconteceu, ata, leads(nome), reuniao_participantes(perfis(id, nome))")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const pessoas = (r.reuniao_participantes as unknown as { perfis: { id: string; nome: string } | null }[])
    .map((p) => p.perfis)
    .filter((p): p is { id: string; nome: string } => !!p);
  const gere = podeGerir(lojas.find((l) => l.id === r.loja_id)?.cargo ?? "conferente");
  // Mesma regra do banco (pode_mudar_reuniao): reunião de lead também pode ser mudada por quem marcou.
  const podeMudar = gere || (!!r.lead_id && r.criado_por === usuario.id);
  const cliente = (r.leads as unknown as { nome: string } | null)?.nome;
  const participa = pessoas.some((p) => p.id === usuario.id);
  const situacao = situacaoReuniao(r);
  const comecou = jaComecou(r.inicio);
  const inicioSP = new Date(Date.parse(r.inicio) - 3 * 3_600_000).toISOString(); // shortcut: UTC-3 fixo (ver paraUtc)

  return (
    <div className={emModal ? "flex flex-col gap-4" : "mx-auto flex max-w-2xl flex-col gap-4"}>
      {!emModal && (
        <Link href={cliente ? `/leads/${r.lead_id}` : "/tarefas"} className="text-sm text-muted-foreground underline">
          {cliente ? "← Lead" : "← Tarefas"}
        </Link>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg">{r.titulo}</h1>
            <Badge variant={situacao === "sem_registro" ? "destructive" : "secondary"}>{ROTULO[situacao]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Quando</dt>
            <dd>
              {horaSP(r.inicio)} · {r.duracao_min} min
            </dd>
            {r.local && (
              <>
                <dt className="text-muted-foreground">Local</dt>
                <dd>{r.local}</dd>
              </>
            )}
            {r.lead_id && cliente && (
              <>
                <dt className="text-muted-foreground">Cliente</dt>
                <dd>
                  <Link href={`/leads/${r.lead_id}`} className="underline">
                    {cliente}
                  </Link>
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Participantes</dt>
            <dd>{pessoas.map((p) => p.nome).join(", ")}</dd>
          </dl>
          {r.pauta && <p className="whitespace-pre-line">{r.pauta}</p>}

          {r.aconteceu !== null && (
            <div className="rounded-lg bg-muted p-3">
              <p className="font-medium">{r.aconteceu ? "Ata" : "A reunião não aconteceu."}</p>
              {r.ata && <p className="mt-1 whitespace-pre-line">{r.ata}</p>}
            </div>
          )}
          {!r.cancelada && r.aconteceu === null && comecou && (gere || participa) && <RegistrarReuniao id={r.id} />}
          {podeMudar && !r.cancelada && !comecou && (
            <div className="flex flex-wrap gap-2">
              <Remarcar id={r.id} data={inicioSP.slice(0, 10)} hora={inicioSP.slice(11, 16)} duracao={r.duracao_min} />
              <Cancelar id={r.id} />
            </div>
          )}
          {!comecou && !r.cancelada && <p className="text-xs text-muted-foreground">O registro abre quando a reunião começar.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
