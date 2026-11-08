"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Link do feed .ics: assina uma vez no celular e as reuniões aparecem na agenda.
export function LinkAgenda({ endereco }: { endereco: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <span className="font-medium">Reuniões na agenda do celular</span>
      <span className="text-muted-foreground">
        Os convites chegam por e-mail. Para ver todas as suas reuniões na agenda, toque em “Assinar agenda” no celular (ou
        copie o endereço e adicione no Google Agenda em “De um URL”).
      </span>
      <label htmlFor="endereco-agenda" className="sr-only">
        Endereço da agenda
      </label>
      <input id="endereco-agenda" readOnly value={endereco} className="h-8 rounded-md border bg-muted px-2 text-xs" />
      <div className="flex gap-2">
        <a href={endereco.replace(/^https?:/, "webcal:")} className="text-sm underline">
          Assinar agenda
        </a>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(endereco);
            setCopiado(true);
          }}
        >
          {copiado ? "Copiado" : "Copiar endereço"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">Não compartilhe: quem tiver o endereço vê suas reuniões.</span>
    </div>
  );
}
