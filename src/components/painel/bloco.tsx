import type { ReactNode } from "react";
import { Sanfona } from "@/components/comum/sanfona";

// Bloco do painel: sanfona aberta por padrão; `fechado` para os menos consultados.
export function Bloco({ titulo, fechado = false, children }: { titulo: string; fechado?: boolean; children: ReactNode }) {
  return (
    <Sanfona titulo={titulo} aberta={!fechado}>
      {children}
    </Sanfona>
  );
}

export const tabela = "w-full text-sm [&_td]:py-1.5 [&_td]:pr-2 [&_th]:pb-2 [&_th]:pr-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_tr]:border-b last:[&_tr]:border-0";

export function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-muted-foreground">{texto}</p>;
}
