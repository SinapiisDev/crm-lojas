import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Caixa que abre e fecha (<details> nativo: funciona sem JS). `region` com nome para leitor de tela e testes.
export function Sanfona({
  titulo,
  extra,
  aberta = false,
  children,
}: {
  titulo: string;
  extra?: ReactNode;
  aberta?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="rounded-3xl bg-card text-card-foreground shadow-card">
      <details open={aberta} className="sanfona group/sanfona">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-3xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <h2 className="text-base font-semibold tracking-tight">
            {titulo}
            {extra != null && <span className="ml-2 text-sm font-normal text-muted-foreground">{extra}</span>}
          </h2>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open/sanfona:rotate-180" />
        </summary>
        <div className="px-5 pb-5">{children}</div>
      </details>
    </section>
  );
}
