import Link from "next/link";
import { AoVivo } from "@/components/comum/ao-vivo";
import { CardTarefa, type TarefaResumo } from "@/components/tarefas/card-tarefa";
import { NovaTarefa } from "@/components/tarefas/nova-tarefa";
import { CardReuniao } from "@/components/reunioes/card-reuniao";
import { NovaReuniao } from "@/components/reunioes/nova-reuniao";
import { hojeSP } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { cn } from "@/lib/utils";

const seteDiasAtras = () => new Date(Date.now() - 7 * 86_400_000).toISOString();
// Reuniões no quadro: de 12 h atrás até 14 dias à frente.
const janelaReunioes = () => [new Date(Date.now() - 12 * 3_600_000).toISOString(), new Date(Date.now() + 14 * 86_400_000).toISOString()];

// Domingo da semana corrente (YYYY-MM-DD), para o filtro "Esta semana".
function fimDaSemana(hoje: string) {
  const d = new Date(hoje + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

export default async function PaginaTarefas({ searchParams }: PageProps<"/tarefas">) {
  const filtros = await searchParams;
  const soSemana = filtros.semana === "1";
  const esconderFeitas = filtros.feitas === "0";
  const { supabase, usuario, lojaAtual } = await obterSessao();
  const hoje = hojeSP();

  let consulta = supabase
    .from("tarefas")
    .select("id, titulo, prazo, status, recorrencia, prazo_pedido, responsavel_id")
    .eq("loja_id", lojaAtual.id)
    .order("prazo", { ascending: true });
  consulta = esconderFeitas
    ? consulta.neq("status", "feito")
    : consulta.or(`status.neq.feito,concluida_em.gte.${seteDiasAtras()}`);
  if (soSemana) consulta = consulta.lte("prazo", fimDaSemana(hoje));

  const [de, ate] = janelaReunioes();
  const [{ data: tarefas }, { data: membros }, { data: reunioes }] = await Promise.all([
    consulta,
    supabase.from("membros").select("perfis(id, nome)").eq("loja_id", lojaAtual.id),
    supabase
      .from("reunioes")
      .select("id, titulo, inicio, reuniao_participantes(usuario_id)")
      .eq("loja_id", lojaAtual.id)
      .eq("cancelada", false)
      .gte("inicio", de)
      .lte("inicio", ate)
      .order("inicio"),
  ]);
  const reunioesDe = (pessoa: string) =>
    (reunioes ?? []).filter((r) => (r.reuniao_participantes as { usuario_id: string }[]).some((p) => p.usuario_id === pessoa));

  const pessoas = (membros ?? [])
    .map((m) => m.perfis as unknown as { id: string; nome: string })
    .sort((a, b) => (a.id === usuario.id ? -1 : b.id === usuario.id ? 1 : a.nome.localeCompare(b.nome)));
  const lista = (tarefas ?? []) as TarefaResumo[];
  // Quem saiu da loja some de `membros`, mas as tarefas dela continuam; ficam numa coluna à parte.
  const semDono = lista.filter((t) => !pessoas.some((p) => p.id === t.responsavel_id));
  const colunas = [...pessoas, ...(semDono.length ? [{ id: "", nome: "Saíram da loja" }] : [])];
  const ordenar = (ts: TarefaResumo[]) => [...ts].sort((a, b) => Number(a.status === "feito") - Number(b.status === "feito"));

  const link = (mudanca: Record<string, string>) => {
    const p = new URLSearchParams({ ...(soSemana && { semana: "1" }), ...(esconderFeitas && { feitas: "0" }), ...mudanca });
    for (const [k, v] of [...p]) if (v === "") p.delete(k);
    return `/tarefas${p.size ? "?" + p : ""}`;
  };
  const filtro = (ativo: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs", ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Tarefas · {lojaAtual.nome}</h1>
        <div className="flex gap-2">
          {podeGerir(lojaAtual.cargo) && <NovaReuniao pessoas={pessoas} hoje={hoje} eu={usuario.id} />}
          <NovaTarefa pessoas={podeGerir(lojaAtual.cargo) ? pessoas : null} hoje={hoje} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={link({ semana: soSemana ? "" : "1" })} className={filtro(soSemana)}>
          Esta semana
        </Link>
        <Link href={link({ feitas: esconderFeitas ? "" : "0" })} className={filtro(esconderFeitas)}>
          {esconderFeitas ? "Mostrar feitas" : "Esconder feitas"}
        </Link>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-4">
        {colunas.map((p) => {
          const daPessoa = ordenar(p.id ? lista.filter((t) => t.responsavel_id === p.id) : semDono);
          return (
            <section key={p.id} aria-label={p.nome} className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted p-2">
              <h2 className="flex justify-between px-1 text-sm font-semibold">
                {p.id === usuario.id ? `${p.nome} (você)` : p.nome}
                <span className="text-muted-foreground">{daPessoa.filter((t) => t.status !== "feito").length}</span>
              </h2>
              <div className="flex min-h-24 flex-col gap-2">
                {p.id &&
                  reunioesDe(p.id).map((r) => <CardReuniao key={r.id} id={r.id} titulo={r.titulo} inicio={r.inicio} />)}
                {daPessoa.map((t) => (
                  <CardTarefa key={t.id} tarefa={t} hoje={hoje} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <AoVivo tabela="tarefas" lojaId={lojaAtual.id} />
    </div>
  );
}
