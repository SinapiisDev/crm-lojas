"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ORIGENS, TIPOS, filtrarLeads, type FiltroLeads, type TipoLead } from "@/lib/regras/leads";
import { cn } from "@/lib/utils";
import type { LeadResumo } from "./card-lead";
import { ListaLeads } from "./lista-leads";
import { NovoLead } from "./novo-lead";
import { Quadro } from "./quadro";

const campoSelect = "h-9 rounded-xl border border-input bg-card px-3 text-sm";

// Abas Clientes/Parceiros, busca, filtros e quadro ou lista. Tudo filtra na tela (os leads já vieram todos).
export function PainelLeads({
  leads,
  diasLimite,
  vendedores,
  mostrarVendedor,
}: {
  leads: LeadResumo[];
  diasLimite: number;
  vendedores: { id: string; nome: string }[] | null;
  mostrarVendedor: boolean;
}) {
  const [filtro, setFiltro] = useState<FiltroLeads>({ tipo: "cliente" });
  const [visao, setVisao] = useState<"quadro" | "lista">("quadro");
  const muda = (parte: Partial<FiltroLeads>) => setFiltro((f) => ({ ...f, ...parte }));

  const visiveis = filtrarLeads(leads, filtro);
  const total = (tipo: TipoLead) => leads.filter((l) => l.tipo === tipo).length;
  const responsaveis = [...new Set(leads.map((l) => l.vendedor).filter((v): v is string => !!v))].sort();
  const filtrando = !!(filtro.busca || filtro.temperatura || filtro.vendedor || filtro.origem);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Tipo de lead" className="flex gap-1 rounded-2xl bg-card p-1 shadow-card">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filtro.tipo === t.id}
              onClick={() => muda({ tipo: t.id })}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm transition-colors",
                filtro.tipo === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.titulo} <span className="opacity-70">{total(t.id)}</span>
            </button>
          ))}
        </div>
        <NovoLead vendedores={vendedores} tipo={filtro.tipo} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Buscar por nome ou telefone"
            placeholder="Buscar por nome ou telefone"
            value={filtro.busca ?? ""}
            onChange={(e) => muda({ busca: e.target.value })}
            className="pl-9"
          />
        </div>
        <select aria-label="Filtrar por temperatura" className={campoSelect} value={filtro.temperatura ?? ""} onChange={(e) => muda({ temperatura: e.target.value })}>
          <option value="">Toda temperatura</option>
          <option value="quente">Quente</option>
          <option value="morno">Morno</option>
          <option value="frio">Frio</option>
          <option value="sem">Sem temperatura</option>
        </select>
        {mostrarVendedor && (
          <select aria-label="Filtrar por responsável" className={campoSelect} value={filtro.vendedor ?? ""} onChange={(e) => muda({ vendedor: e.target.value })}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Filtrar por origem" className={campoSelect} value={filtro.origem ?? ""} onChange={(e) => muda({ origem: e.target.value })}>
          <option value="">Toda origem</option>
          {ORIGENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.titulo}
            </option>
          ))}
        </select>
        {filtrando && (
          <button type="button" onClick={() => setFiltro({ tipo: filtro.tipo })} className="text-sm text-muted-foreground underline">
            Limpar
          </button>
        )}
        <div role="group" aria-label="Visão" className="ml-auto flex gap-1 rounded-xl bg-card p-1 shadow-card">
          {(["quadro", "lista"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visao === v}
              aria-label={v === "quadro" ? "Ver em quadro" : "Ver em lista"}
              onClick={() => setVisao(v)}
              className={cn("rounded-lg p-1.5", visao === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "quadro" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      {filtrando && (
        <p role="status" className="text-sm text-muted-foreground">
          {visiveis.length === 1 ? "1 lead encontrado." : `${visiveis.length} leads encontrados.`}
        </p>
      )}

      {visao === "lista" ? (
        <ListaLeads leads={visiveis} mostrarVendedor={mostrarVendedor} />
      ) : (
        <Quadro
          leads={visiveis}
          diasLimite={diasLimite}
          mostrarVendedor={mostrarVendedor}
          rodapeNovo={<NovoLead vendedores={vendedores} gatilho="rodape" tipo={filtro.tipo} />}
        />
      )}
    </div>
  );
}
