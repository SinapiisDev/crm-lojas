"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { apagarMemoria } from "./actions";

export type MemoriaLoja = { id: string; texto: string; loja: string };

// O que o Assistente "aprendeu" da loja (confirmado pela gerência). Apagar tira da próxima conversa.
// Lista vem sempre do servidor (memória confirmada no chat aparece ao revalidar); só a remoção é otimista.
export function MemoriasDaLoja({ inicial }: { inicial: MemoriaLoja[] }) {
  const [apagadas, setApagadas] = useState<string[]>([]);
  const memorias = inicial.filter((m) => !apagadas.includes(m.id));
  const [erro, setErro] = useState("");
  const [, iniciar] = useTransition();
  return (
    <section aria-label="Memória da loja" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
      <h2 className="text-base font-semibold tracking-tight">Memória da loja</h2>
      {!memorias.length && (
        <p className="text-sm text-muted-foreground">
          Nada guardado ainda. Diga ao Assistente o que vale daqui pra frente (ex.: “cobrança de parceiro é às terças”) e confirme.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {memorias.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
            <div>
              <p>{m.texto}</p>
              <p className="text-xs text-muted-foreground">{m.loja}</p>
            </div>
            <button
              type="button"
              aria-label={`Apagar ${m.texto}`}
              onClick={() =>
                iniciar(async () => {
                  const r = await apagarMemoria(m.id);
                  if ("erro" in r) setErro(r.erro);
                  else setApagadas((ids) => [...ids, m.id]);
                })
              }
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
