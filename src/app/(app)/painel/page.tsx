import Link from "next/link";
import { notFound } from "next/navigation";
import { Bloco, Vazio, tabela } from "@/components/painel/bloco";
import { Cobrar } from "@/components/tarefas/acoes-tarefa";
import { formatarMoeda } from "@/lib/formatar";
import {
  periodo,
  resumoPorLoja,
  tarefasAtrasadas,
  tarefasPorPessoa,
  vendasPorVendedora,
  type LeadPainel,
  type TarefaPainel,
} from "@/lib/regras/painel";
import { diasEntre, hojeSP, mensagemCobranca } from "@/lib/regras/tarefas";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { cn } from "@/lib/utils";

// shortcut: o PostgREST devolve no máximo 1000 linhas (max_rows); acima disso o painel avisa. Mover a soma para SQL quando aparecer o aviso.
const LIMITE = 1000;
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const nomeDe = (p: unknown) => (p as { nome: string } | null)?.nome ?? "—";

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const dif = atual - anterior;
  if (!dif) return null;
  return (
    <span className={cn("ml-1 text-xs", dif > 0 ? "text-green-700" : "text-destructive")}>
      {dif > 0 ? "▲" : "▼"}
      {Math.abs(dif)}
    </span>
  );
}

export default async function PaginaPainel({ searchParams }: PageProps<"/painel">) {
  const filtros = await searchParams;
  const { supabase, lojas } = await obterSessao();
  const geridas = lojas.filter((l) => podeGerir(l.cargo));
  if (!geridas.length) notFound();

  // Loja fora das que a pessoa gere cai em "todas".
  const escolhida = geridas.find((l) => l.id === filtros.loja);
  const selecionadas = escolhida ? [escolhida] : geridas;
  const ids = selecionadas.map((l) => l.id);
  const hoje = hojeSP();
  const p = periodo(filtros.dias === "30" ? 30 : 7, hoje);

  const [{ data: leads }, { data: tarefas }] = await Promise.all([
    supabase
      .from("leads")
      .select("loja_id, etapa, valor_vendido, criado_em, fechado_em, ultimo_contato_em, perfis!leads_vendedor_id_fkey(nome)")
      .in("loja_id", ids)
      .or(`criado_em.gte.${p.inicioAnterior},fechado_em.gte.${p.inicio},etapa.in.(orcamento_enviado,negociacao)`)
      .limit(LIMITE),
    supabase
      .from("tarefas")
      .select("id, loja_id, titulo, prazo, status, concluida_em, perfis!tarefas_responsavel_id_fkey(nome)")
      .in("loja_id", ids)
      .or(`prazo.gte.${p.inicio},status.neq.feito`)
      .limit(LIMITE),
  ]);

  const listaLeads: LeadPainel[] = (leads ?? []).map(({ perfis, ...l }) => ({ ...l, vendedor: nomeDe(perfis) }) as LeadPainel);
  const listaTarefas: TarefaPainel[] = (tarefas ?? []).map(
    ({ perfis, ...t }) => ({ ...t, responsavel: nomeDe(perfis) }) as TarefaPainel,
  );
  const linhas = resumoPorLoja(selecionadas, listaLeads, p);
  const atrasadas = tarefasAtrasadas(listaTarefas, hoje);
  const porPessoa = tarefasPorPessoa(listaTarefas, p, hoje);
  const vendas = vendasPorVendedora(listaLeads, p);
  const variasLojas = selecionadas.length > 1;
  const incompleto = (leads?.length ?? 0) >= LIMITE || (tarefas?.length ?? 0) >= LIMITE;
  const nomeLoja = (id: string) => geridas.find((l) => l.id === id)?.nome;

  const link = (mudanca: Record<string, string>) => {
    const q = new URLSearchParams({ ...(escolhida && { loja: escolhida.id }), ...(p.dias === 30 && { dias: "30" }), ...mudanca });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/painel${q.size ? "?" + q : ""}`;
  };
  const filtro = (ativo: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs", ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Painel</h1>
        <p className="text-sm text-muted-foreground">
          {ddmm(p.inicio)} a {ddmm(p.fim)} · comparado com os {p.dias} dias anteriores
        </p>
        <div className="flex flex-wrap gap-2">
          {geridas.length > 1 && (
            <Link href={link({ loja: "" })} className={filtro(!escolhida)}>
              Todas as lojas
            </Link>
          )}
          {geridas.length > 1 &&
            geridas.map((l) => (
              <Link key={l.id} href={link({ loja: l.id })} className={filtro(escolhida?.id === l.id)}>
                {l.nome}
              </Link>
            ))}
          <span className="mx-1 hidden w-px bg-border sm:block" />
          <Link href={link({ dias: "" })} className={filtro(p.dias === 7)}>
            Últimos 7 dias
          </Link>
          <Link href={link({ dias: "30" })} className={filtro(p.dias === 30)}>
            Últimos 30 dias
          </Link>
        </div>
      </div>

      {incompleto && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Muitos registros no período: os números abaixo podem estar incompletos. Avise o suporte.
        </p>
      )}

      <Bloco titulo="Leads e vendas por loja">
        <div className="overflow-x-auto">
          <table className={cn(tabela, "min-w-[560px]")}>
            <thead>
              <tr>
                <th>Loja</th>
                <th>Leads novos</th>
                <th>Vendidos</th>
                <th>Conversão</th>
                <th>Valor vendido</th>
                <th>Leads parados</th>
              </tr>
            </thead>
            <tbody>
              {(variasLojas ? linhas : linhas.slice(0, 1)).map((l) => (
                <tr key={l.id} className={cn(l.id === "total" && "font-semibold")}>
                  <td>{l.nome}</td>
                  <td>
                    {l.novos}
                    <Variacao atual={l.novos} anterior={l.novosAnterior} />
                  </td>
                  <td>{l.vendidos}</td>
                  <td>{l.conversao}%</td>
                  <td>{formatarMoeda(l.valorVendido)}</td>
                  <td className={cn(l.parados > 0 && "text-destructive")}>{l.parados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Parado = em orçamento ou negociação sem contato há mais dias que o limite da loja. Conversão = vendidos ÷ leads novos.
        </p>
      </Bloco>

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco titulo="Tarefas atrasadas">
          {atrasadas.length ? (
            <table className={tabela}>
              <tbody>
                {atrasadas.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/tarefas/${t.id}`} className="underline-offset-2 hover:underline">
                        {t.titulo}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {t.responsavel}
                        {variasLojas && ` · ${nomeLoja(t.loja_id)}`}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-destructive">
                      {diasEntre(t.prazo, hoje)} {diasEntre(t.prazo, hoje) === 1 ? "dia" : "dias"}
                    </td>
                    <td className="text-right">
                      <Cobrar id={t.id} mensagem={mensagemCobranca(t.responsavel, t.titulo, t.prazo, hoje)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vazio texto="Nenhuma tarefa atrasada." />
          )}
        </Bloco>

        <Bloco titulo="Tarefas do período por pessoa">
          {porPessoa.length ? (
            <table className={tabela}>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Feitas no prazo</th>
                  <th>Atrasadas</th>
                  <th>Abertas</th>
                </tr>
              </thead>
              <tbody>
                {porPessoa.map((x) => (
                  <tr key={x.pessoa}>
                    <td>{x.pessoa}</td>
                    <td>{x.feitasNoPrazo}</td>
                    <td className={cn(x.atrasadas > 0 && "text-destructive")}>{x.atrasadas}</td>
                    <td>{x.abertas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vazio texto="Nenhuma tarefa com prazo no período." />
          )}
        </Bloco>

        <Bloco titulo="Vendas por vendedora">
          {vendas.length ? (
            <table className={tabela}>
              <thead>
                <tr>
                  <th>Vendedora</th>
                  <th>Leads novos</th>
                  <th>Vendidos</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.vendedor}>
                    <td>{v.vendedor}</td>
                    <td>{v.novos}</td>
                    <td>{v.vendidos}</td>
                    <td>{formatarMoeda(v.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Vazio texto="Sem leads nem vendas no período." />
          )}
        </Bloco>
      </div>
    </div>
  );
}
