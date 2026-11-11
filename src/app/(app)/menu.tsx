"use client";

import { LayoutDashboard, ListChecks, Sparkles, SquareKanban, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/painel", titulo: "Painel", icone: LayoutDashboard, soGestor: true },
  { href: "/leads", titulo: "Leads", icone: SquareKanban },
  { href: "/tarefas", titulo: "Tarefas", icone: ListChecks },
  { href: "/equipe", titulo: "Equipe", icone: Users },
  { href: "/assistente", titulo: "Assistente", icone: Sparkles, soGestor: true },
];

// Lateral (computador) ou barra inferior (celular); item ativo em preto, como na referência.
export function Menu({ gestor, variante = "lateral" }: { gestor: boolean; variante?: "lateral" | "inferior" }) {
  const caminho = usePathname();
  const itens = ITENS.filter((i) => gestor || !i.soGestor);
  if (variante === "inferior") {
    return (
      <nav className="grid auto-cols-fr grid-flow-col gap-1">
        {itens.map(({ href, titulo, icone: Icone }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-medium",
              caminho.startsWith(href) ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icone className="size-5" aria-hidden />
            {titulo}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="flex flex-col gap-1">
      {itens.map(({ href, titulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
            caminho.startsWith(href) ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted",
          )}
        >
          <Icone className="size-[18px]" aria-hidden />
          {titulo}
        </Link>
      ))}
    </nav>
  );
}
