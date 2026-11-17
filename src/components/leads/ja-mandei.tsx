"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { marcarMensagemEnviada } from "@/app/(app)/leads/actions";

// Depois de mandar pelo WhatsApp a partir do aviso, registra o contato: o lead sai dos parados.
export function JaMandei({ id, registrado }: { id: string; registrado: boolean }) {
  const [feito, setFeito] = useState(registrado);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  if (feito) return <p className="text-sm text-sucesso">Contato registrado</p>;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await marcarMensagemEnviada(id);
            if (r.erro) setErro(r.erro);
            else setFeito(true);
          })
        }
      >
        Já mandei
      </Button>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
