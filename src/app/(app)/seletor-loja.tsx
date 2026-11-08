"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { trocarLoja } from "./acoes-loja";

export function SeletorLoja({ lojas, atual }: { lojas: { id: string; nome: string }[]; atual: string }) {
  const [pendente, iniciar] = useTransition();
  // O painel tem filtro de loja próprio (inclui "Todas"); dois seletores na mesma tela confundem.
  if (usePathname().startsWith("/painel")) return null;
  if (lojas.length < 2) return <span className="text-sm font-medium">{lojas[0]?.nome}</span>;
  return (
    <select
      aria-label="Loja"
      className="h-8 rounded-md border bg-background px-2 text-sm"
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
  );
}
