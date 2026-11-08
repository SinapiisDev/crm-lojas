"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { trocarLoja } from "./acoes-loja";

export function SeletorLoja({
  lojas,
  atual,
  comRotulo,
}: {
  lojas: { id: string; nome: string }[];
  atual: string;
  comRotulo?: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  // O painel tem filtro de loja próprio (inclui "Todas"); dois seletores na mesma tela confundem.
  if (usePathname().startsWith("/painel")) return null;
  const rotulo = comRotulo && (
    <span className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Loja</span>
  );
  if (lojas.length < 2)
    return (
      <div className="flex flex-col gap-2">
        {rotulo}
        <span className="px-1 text-sm font-medium">{lojas[0]?.nome}</span>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {rotulo}
      <select
      aria-label="Loja"
      className="h-9 w-full rounded-xl border border-input bg-card px-3 text-sm"
      defaultValue={atual}
      disabled={pendente}
      onChange={(e) => iniciar(() => trocarLoja(e.target.value))}
    >
      {lojas.map((l) => (
        <option key={l.id} value={l.id}>
          {l.nome}
        </option>
      ))}
      </select>
    </div>
  );
}
