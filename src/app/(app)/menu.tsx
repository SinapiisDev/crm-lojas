"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/leads", titulo: "Leads" },
  { href: "/equipe", titulo: "Equipe" },
];

export function Menu() {
  const caminho = usePathname();
  return (
    <nav className="flex gap-1">
      {ITENS.map((i) => (
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
