import { describe, expect, test } from "vitest";
import {
  diaSP,
  periodo,
  resumoPorLoja,
  tarefasAtrasadas,
  tarefasPorPessoa,
  vendasPorVendedora,
  type LeadPainel,
  type TarefaPainel,
} from "./painel";

const HOJE = "2026-11-10";
const P7 = periodo(7, HOJE);
const AGORA = new Date("2026-11-10T15:00:00-03:00");
const lojas = [
  { id: "L1", nome: "Loja 1", dias_lead_parado: 2 },
  { id: "L2", nome: "Loja 2", dias_lead_parado: 2 },
];

const lead = (l: Partial<LeadPainel>): LeadPainel => ({
  loja_id: "L1",
  vendedor: "Carla",
  etapa: "novo",
  valor_vendido: null,
  criado_em: "2026-10-01T10:00:00-03:00",
  fechado_em: null,
  ultimo_contato_em: "2026-11-10T09:00:00-03:00",
  ...l,
});

const LEADS: LeadPainel[] = [
  lead({ criado_em: "2026-11-05T10:00:00-03:00" }),
  lead({ criado_em: "2026-11-11T02:30:00Z" }), // 23h30 do dia 10 em SP
  lead({ criado_em: "2026-11-04T00:30:00-03:00" }),
  lead({ etapa: "vendido", valor_vendido: 1500, fechado_em: "2026-11-06T11:00:00-03:00" }),
  lead({ vendedor: "Fê", criado_em: "2026-10-30T10:00:00-03:00" }),
  lead({ vendedor: "Fê", loja_id: "L2", etapa: "negociacao", ultimo_contato_em: "2026-11-07T10:00:00-03:00" }),
  lead({ vendedor: "Fê", etapa: "vendido", valor_vendido: 999, fechado_em: "2026-10-31T10:00:00-03:00" }),
];

describe("periodo", () => {
  test("7 e 30 dias contando hoje", () => {
    expect(periodo(7, HOJE)).toEqual({ dias: 7, inicio: "2026-11-04", fim: HOJE, inicioAnterior: "2026-10-28" });
    expect(periodo(30, HOJE)).toEqual({ dias: 30, inicio: "2026-10-12", fim: HOJE, inicioAnterior: "2026-09-12" });
  });
});

describe("diaSP", () => {
  test("converte para o dia de São Paulo", () => {
    expect(diaSP("2026-11-11T02:30:00Z")).toBe("2026-11-10");
  });
});

describe("resumoPorLoja", () => {
  test("conta novos, anteriores, vendidos, conversão, valor e parados", () => {
    expect(resumoPorLoja(lojas, LEADS, P7, AGORA)).toEqual([
      { id: "L1", nome: "Loja 1", novos: 3, novosAnterior: 1, vendidos: 1, conversao: 33, valorVendido: 1500, parados: 0 },
      { id: "L2", nome: "Loja 2", novos: 0, novosAnterior: 0, vendidos: 0, conversao: 0, valorVendido: 0, parados: 1 },
      { id: "total", nome: "Total", novos: 3, novosAnterior: 1, vendidos: 1, conversao: 33, valorVendido: 1500, parados: 1 },
    ]);
  });

  test("período sem leads não divide por zero", () => {
    const [l1] = resumoPorLoja(lojas, [], P7, AGORA);
    expect(l1.conversao).toBe(0);
  });
});

const tarefa = (t: Partial<TarefaPainel>): TarefaPainel => ({
  id: Math.random().toString(36),
  loja_id: "L1",
  titulo: "t",
  responsavel: "Ana",
  prazo: HOJE,
  status: "a_fazer",
  concluida_em: null,
  ...t,
});

describe("tarefasAtrasadas", () => {
  test("abertas com prazo antes de hoje, mais antiga primeiro", () => {
    const t1 = tarefa({ prazo: "2026-11-08" });
    const t2 = tarefa({ prazo: "2026-11-09", status: "fazendo" });
    const lista = [t2, tarefa({ prazo: HOJE }), tarefa({ prazo: "2026-11-01", status: "feito" }), t1];
    expect(tarefasAtrasadas(lista, HOJE)).toEqual([t1, t2]);
  });
});

describe("tarefasPorPessoa", () => {
  test("feitas no prazo, atrasadas e abertas com prazo no período", () => {
    const lista = [
      tarefa({ prazo: "2026-11-05", status: "feito", concluida_em: "2026-11-05T20:00:00-03:00" }),
      tarefa({ prazo: "2026-11-06", status: "feito", concluida_em: "2026-11-08T10:00:00-03:00" }),
      tarefa({ prazo: "2026-11-09" }),
      tarefa({ prazo: HOJE }),
      tarefa({ prazo: "2026-11-20" }),
      tarefa({ responsavel: "Bruno", prazo: "2026-11-04", status: "feito", concluida_em: "2026-11-05T02:00:00Z" }),
    ];
    expect(tarefasPorPessoa(lista, P7, HOJE)).toEqual([
      { pessoa: "Ana", feitasNoPrazo: 1, atrasadas: 2, abertas: 1 },
      { pessoa: "Bruno", feitasNoPrazo: 1, atrasadas: 0, abertas: 0 },
    ]);
  });
});

describe("vendasPorVendedora", () => {
  test("só quem teve movimento no período, maior valor primeiro", () => {
    expect(vendasPorVendedora(LEADS, P7)).toEqual([{ vendedor: "Carla", novos: 3, vendidos: 1, valor: 1500 }]);
  });
});
