"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

// "+ Adicionar card" no rodapé da coluna, como no Trello: abre um campo, Enter adiciona e continua aberto.
export function AdicionarCard({
  rotulo,
  placeholder,
  aoAdicionar,
}: {
  rotulo: string;
  placeholder: string;
  aoAdicionar: (texto: string) => Promise<{ erro?: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 rounded-2xl px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        {rotulo}
      </button>
    );

  const enviar = () =>
    texto.trim() &&
    iniciar(async () => {
      const r = await aoAdicionar(texto.trim());
      setErro(r.erro);
      if (!r.erro) setTexto("");
    });

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        aria-label={placeholder}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            enviar();
          }
          if (e.key === "Escape") setAberto(false);
        }}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-2xl bg-card p-3 text-sm shadow-card outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      {erro && <p className="px-1 text-xs text-destructive">{erro}</p>}
      <div className="flex items-center gap-1">
        <Button size="sm" disabled={salvando || !texto.trim()} onClick={enviar}>
          Adicionar
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Fechar" onClick={() => setAberto(false)}>
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
