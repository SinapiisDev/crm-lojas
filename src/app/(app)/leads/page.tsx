import { AoVivo } from "@/components/comum/ao-vivo";
import { NovoLead } from "@/components/leads/novo-lead";
import { Quadro } from "@/components/leads/quadro";
import type { LeadResumo } from "@/components/leads/card-lead";
import { obterSessao, podeGerir } from "@/lib/sessao";

const trintaDiasAtras = () => new Date(Date.now() - 30 * 86_400_000).toISOString();

export default async function PaginaLeads() {
  const { supabase, usuario, lojaAtual } = await obterSessao();
  if (lojaAtual.cargo === "conferente") {
    return <p className="text-muted-foreground">Seu cargo não acompanha leads.</p>;
  }
  const gere = podeGerir(lojaAtual.cargo);
  const trintaDias = trintaDiasAtras();

  // Vendidos/perdidos só dos últimos 30 dias, para o quadro não crescer sem fim.
  const [{ data: leads }, { data: equipe }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nome, origem, etapa, valor_estimado, valor_vendido, ultimo_contato_em, temperatura, perfis!leads_vendedor_id_fkey(nome), reunioes(inicio)")
      .eq("loja_id", lojaAtual.id)
      .gte("reunioes.inicio", new Date().toISOString())
      .eq("reunioes.cancelada", false)
      .or(`fechado_em.is.null,fechado_em.gte.${trintaDias}`)
      .order("ultimo_contato_em", { ascending: true }),
    gere
      ? supabase.from("membros").select("cargo, perfis(id, nome)").eq("loja_id", lojaAtual.id).neq("cargo", "conferente")
      : Promise.resolve({ data: null }),
  ]);

  const resumo: LeadResumo[] = (leads ?? []).map(({ perfis, reunioes, ...l }) => ({
    ...l,
    vendedor: (perfis as unknown as { nome: string } | null)?.nome ?? null,
    // Próxima reunião marcada com o cliente (só as futuras e não canceladas vêm do banco).
    reuniao: (reunioes as { inicio: string }[]).map((r) => r.inicio).sort()[0] ?? null,
  })) as LeadResumo[];
  const vendedores =
    equipe?.map((m) => m.perfis as unknown as { id: string; nome: string }).sort((a, b) => (a.id === usuario.id ? -1 : b.id === usuario.id ? 1 : a.nome.localeCompare(b.nome))) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Leads · {lojaAtual.nome}</h1>
        <NovoLead vendedores={vendedores} />
      </div>
      <Quadro
        leads={resumo}
        diasLimite={lojaAtual.dias_lead_parado}
        mostrarVendedor={gere}
        rodapeNovo={<NovoLead vendedores={vendedores} gatilho="rodape" />}
      />
      <AoVivo tabela="leads" lojaId={lojaAtual.id} />
    </div>
  );
}
