// Agregações do painel. shortcut: soma em TypeScript sobre linhas cruas (até 1000 por consulta, ver painel/page.tsx); mover para SQL quando o painel avisar.
import { leadParado, type Etapa } from "./leads";
import { hojeSP, type StatusTarefa } from "./tarefas";

export type Periodo = { dias: 7 | 30; inicio: string; fim: string; inicioAnterior: string };
export type LojaPainel = { id: string; nome: string; dias_lead_parado: number };
export type LeadPainel = {
  loja_id: string;
  vendedor: string;
  etapa: Etapa;
  valor_vendido: number | null;
  criado_em: string;
  fechado_em: string | null;
  ultimo_contato_em: string;
};
export type TarefaPainel = {
  id: string;
  loja_id: string;
  titulo: string;
  responsavel: string;
  prazo: string;
  status: StatusTarefa;
  concluida_em: string | null;
};
export type LinhaLoja = {
  id: string;
  nome: string;
  novos: number;
  novosAnterior: number;
  vendidos: number;
  conversao: number;
  valorVendido: number;
  parados: number;
};

function somarDias(data: string, n: number) {
  const d = new Date(data + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diaSP = (iso: string) => hojeSP(new Date(iso));

export function periodo(dias: 7 | 30, hoje: string): Periodo {
  const inicio = somarDias(hoje, -(dias - 1));
  return { dias, inicio, fim: hoje, inicioAnterior: somarDias(inicio, -dias) };
}

const dentro = (dia: string, de: string, ate: string) => dia >= de && dia <= ate;
const ehNovo = (l: LeadPainel, p: Periodo) => dentro(diaSP(l.criado_em), p.inicio, p.fim);
const ehVendido = (l: LeadPainel, p: Periodo) =>
  l.etapa === "vendido" && !!l.fechado_em && dentro(diaSP(l.fechado_em), p.inicio, p.fim);

function linha(id: string, nome: string, leads: LeadPainel[], p: Periodo, parados: number): LinhaLoja {
  const novos = leads.filter((l) => ehNovo(l, p)).length;
  const vendidos = leads.filter((l) => ehVendido(l, p));
  return {
    id,
    nome,
    novos,
    novosAnterior: leads.filter((l) => dentro(diaSP(l.criado_em), p.inicioAnterior, somarDias(p.inicio, -1))).length,
    vendidos: vendidos.length,
    conversao: novos ? Math.round((vendidos.length / novos) * 100) : 0,
    valorVendido: vendidos.reduce((s, l) => s + Number(l.valor_vendido ?? 0), 0),
    parados,
  };
}

export function resumoPorLoja(lojas: LojaPainel[], leads: LeadPainel[], p: Periodo, agora = new Date()): LinhaLoja[] {
  const linhas = lojas.map((loja) => {
    const daLoja = leads.filter((l) => l.loja_id === loja.id);
    const parados = daLoja.filter((l) => leadParado(l, loja.dias_lead_parado, agora)).length;
    return linha(loja.id, loja.nome, daLoja, p, parados);
  });
  const total = linha("total", "Total", leads.filter((l) => lojas.some((j) => j.id === l.loja_id)), p,
    linhas.reduce((s, l) => s + l.parados, 0));
  return [...linhas, total];
}

export function tarefasAtrasadas(tarefas: TarefaPainel[], hoje: string): TarefaPainel[] {
  return tarefas.filter((t) => t.status !== "feito" && t.prazo < hoje).sort((a, b) => a.prazo.localeCompare(b.prazo));
}

export function tarefasPorPessoa(tarefas: TarefaPainel[], p: Periodo, hoje: string) {
  const porPessoa = new Map<string, { pessoa: string; feitasNoPrazo: number; atrasadas: number; abertas: number }>();
  for (const t of tarefas) {
    if (!dentro(t.prazo, p.inicio, p.fim)) continue;
    const c = porPessoa.get(t.responsavel) ?? { pessoa: t.responsavel, feitasNoPrazo: 0, atrasadas: 0, abertas: 0 };
    if (t.status === "feito") {
      if (t.concluida_em && diaSP(t.concluida_em) <= t.prazo) c.feitasNoPrazo++;
      else c.atrasadas++;
    } else if (t.prazo < hoje) c.atrasadas++;
    else c.abertas++;
    porPessoa.set(t.responsavel, c);
  }
  return [...porPessoa.values()].sort((a, b) => a.pessoa.localeCompare(b.pessoa));
}

export function vendasPorVendedora(leads: LeadPainel[], p: Periodo) {
  const porVendedor = new Map<string, { vendedor: string; novos: number; vendidos: number; valor: number }>();
  for (const l of leads) {
    const novo = ehNovo(l, p);
    const vendido = ehVendido(l, p);
    if (!novo && !vendido) continue;
    const c = porVendedor.get(l.vendedor) ?? { vendedor: l.vendedor, novos: 0, vendidos: 0, valor: 0 };
    if (novo) c.novos++;
    if (vendido) {
      c.vendidos++;
      c.valor += Number(l.valor_vendido ?? 0);
    }
    porVendedor.set(l.vendedor, c);
  }
  return [...porVendedor.values()].sort((a, b) => b.valor - a.valor || a.vendedor.localeCompare(b.vendedor));
}
