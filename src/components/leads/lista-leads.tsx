"use client";

import Link from "next/link";
import { useState } from "react";
import { Etiqueta } from "@/components/comum/quadro";
import { formatarTelefone, textoSemContato } from "@/lib/formatar";
import { ETAPAS, diasSemContato } from "@/lib/regras/leads";
import { TEMPERATURA, type LeadResumo } from "./card-lead";

type Coluna = "nome" | "etapa" | "temperatura" | "ultimo_contato_em" | "vendedor";
const ORDEM_ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e.id, i]));
const ORDEM_TEMP: Record<string, number> = { quente: 0, morno: 1, frio: 2 };
const chave = (l: LeadResumo, c: Coluna): string | number =>
  c === "etapa" ? ORDEM_ETAPA[l.etapa] : c === "temperatura" ? (ORDEM_TEMP[l.temperatura ?? ""] ?? 3) : c === "vendedor" ? (l.vendedor ?? "") : l[c];

export function ListaLeads({ leads, mostrarVendedor }: { leads: LeadResumo[]; mostrarVendedor: boolean }) {
  // Padrão: quem está há mais tempo sem contato primeiro (quem precisa de atenção).
  const [ordem, setOrdem] = useState<Ordem>({ coluna: "ultimo_contato_em", sobe: true });
  const ordenados = [...leads].sort((a, b) => {
    const [x, y] = [chave(a, ordem.coluna), chave(b, ordem.coluna)];
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
    return ordem.sobe ? r : -r;
  });

  const cab = { ordem, setOrdem };

  return (
    <div className="overflow-x-auto rounded-3xl bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <Cab coluna="nome" titulo="Nome" {...cab} />
            <th scope="col" className="px-3 py-2 text-left font-medium">Telefone</th>
            <Cab coluna="etapa" titulo="Etapa" {...cab} />
            <Cab coluna="temperatura" titulo="Temperatura" {...cab} />
            <Cab coluna="ultimo_contato_em" titulo="Último contato" {...cab} />
            {mostrarVendedor && <Cab coluna="vendedor" titulo="Responsável" {...cab} />}
          </tr>
        </thead>
        <tbody className="divide-y">
          {ordenados.map((l) => (
            <tr key={l.id} className="hover:bg-muted/50">
              <td className="px-3 py-2">
                <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                  {l.nome}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{l.telefone ? formatarTelefone(l.telefone) : "—"}</td>
              <td className="px-3 py-2">{ETAPAS.find((e) => e.id === l.etapa)?.titulo}</td>
              <td className="px-3 py-2">{l.temperatura ? <Etiqueta cor={TEMPERATURA[l.temperatura].cor}>{TEMPERATURA[l.temperatura].texto}</Etiqueta> : "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{textoSemContato(diasSemContato(l.ultimo_contato_em))}</td>
              {mostrarVendedor && <td className="px-3 py-2">{l.vendedor ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!ordenados.length && <p className="p-5 text-sm text-muted-foreground">Nenhum lead com esses filtros.</p>}
    </div>
  );
}

type Ordem = { coluna: Coluna; sobe: boolean };
function Cab({ coluna, titulo, ordem, setOrdem }: { coluna: Coluna; titulo: string; ordem: Ordem; setOrdem: (o: Ordem) => void }) {
  const ativa = ordem.coluna === coluna;
  return (
    <th scope="col" aria-sort={ativa ? (ordem.sobe ? "ascending" : "descending") : "none"} className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => setOrdem({ coluna, sobe: ativa ? !ordem.sobe : true })} className="hover:underline">
        {titulo} {ativa ? (ordem.sobe ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}
