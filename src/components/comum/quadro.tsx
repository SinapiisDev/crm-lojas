import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Peças do quadro estilo Trello: colunas cinza, cards brancos com sombra suave, etiquetas coloridas.

export const estiloQuadro = "flex snap-x gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]";
export const estiloColuna = "flex w-[17.5rem] shrink-0 snap-start flex-col gap-2 self-start rounded-3xl bg-lista p-2.5 shadow-card";
export const estiloCard =
  "block rounded-2xl bg-card p-3 text-sm shadow-card transition-shadow hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function CabecalhoColuna({ titulo, total }: { titulo: ReactNode; total: number }) {
  return (
    <h2 className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-0.5 text-sm font-semibold">
      <span className="truncate">{titulo}</span>
      <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground shadow-card">{total}</span>
    </h2>
  );
}

const CORES = {
  cinza: "bg-muted text-foreground/75",
  preto: "bg-primary text-primary-foreground",
  vermelho: "bg-destructive/12 text-destructive",
  ambar: "bg-atencao/20 text-[oklch(0.45_0.11_70)]",
  verde: "bg-sucesso/15 text-[oklch(0.42_0.1_155)]",
  azul: "bg-info/12 text-info",
  rosa: "bg-[oklch(0.65_0.18_350/0.14)] text-[oklch(0.48_0.17_350)]",
  roxo: "bg-[oklch(0.55_0.18_295/0.13)] text-[oklch(0.45_0.16_295)]",
};
export type CorEtiqueta = keyof typeof CORES;

export function Etiqueta({ cor = "cinza", children, className }: { cor?: CorEtiqueta; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-semibold", CORES[cor], className)}>
      {children}
    </span>
  );
}
