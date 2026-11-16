"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { removerMembro, type EstadoConvite } from "./actions";

export function RemoverMembro({ id, nome }: { id: string; nome: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoConvite, FormData>(removerMembro.bind(null, id), {});
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm(`Remover ${nome} desta loja? Ela perde o acesso na hora.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <Button type="submit" variant="ghost" size="sm" disabled={enviando} aria-label={`Remover ${nome}`}>
        {enviando ? "Removendo..." : "Remover"}
      </Button>
      {estado.erro && <p role="alert" className="max-w-xs text-right text-xs text-destructive">{estado.erro}</p>}
    </form>
  );
}
