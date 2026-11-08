import type { ReactNode } from "react";

// Caixa com título do painel; `region` com nome para leitor de tela e testes.
export function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="rounded-3xl bg-card p-5 shadow-card">
      <h2 className="mb-4 text-base font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

export const tabela = "w-full text-sm [&_td]:py-1.5 [&_td]:pr-2 [&_th]:pb-2 [&_th]:pr-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_tr]:border-b last:[&_tr]:border-0";

export function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-muted-foreground">{texto}</p>;
}
