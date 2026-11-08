"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/painel", titulo: "Painel", soGestor: true },
  { href: "/leads", titulo: "Leads" },
  { href: "/tarefas", titulo: "Tarefas" },
  { href: "/equipe", titulo: "Equipe" },
];

export function Menu({ gestor }: { gestor: boolean }) {
  const caminho = usePathname();
  return (
    <nav className="flex gap-1">
      {ITENS.filter((i) => gestor || !i.soGestor).map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            caminho.startsWith(i.href) ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {i.titulo}
        </Link>
      ))}
    </nav>
  );
}
