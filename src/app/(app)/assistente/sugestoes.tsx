"use client";

import { use } from "react";
import { Button } from "@/components/ui/button";
import type { Sugestao } from "@/lib/ia/sugestoes";

export type SugestaoLoja = Sugestao & { loja: string };

// Cartões do dia. "Fazer isso" manda o pedido pronto para o chat, como se a dona tivesse escrito.
export function SugestoesDoDia({ promessa, fazer, ocupado }: { promessa: Promise<SugestaoLoja[]>; fazer: (pedido: string) => void; ocupado: boolean }) {
  const sugestoes = use(promessa);
  if (!sugestoes.length) return null;
  return (
    <section aria-label="Sugestões do dia" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
      <h2 className="text-base font-semibold tracking-tight">Sugestões de hoje</h2>
      <ul className="flex flex-col gap-2">
        {sugestoes.map((s, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p>{s.texto}</p>
              <p className="text-xs text-muted-foreground">{s.loja}</p>
            </div>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => fazer(s.pedido)} className="shrink-0">
              Fazer isso
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
