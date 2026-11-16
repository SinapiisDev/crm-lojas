"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { passarLeads, type EstadoConvite } from "./actions";

type Pessoa = { id: string; nome: string };
const campoSelect = "h-9 rounded-xl border border-input bg-card px-3 text-sm";

export function PassarLeads({ pessoas }: { pessoas: Pessoa[] }) {
  const [estado, enviar, enviando] = useActionState<EstadoConvite, FormData>(passarLeads, {});
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (!confirm("Passar todos os leads em aberto dessa pessoa? Os vendidos continuam com ela.")) e.preventDefault();
      }}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="de">Leads de</Label>
        <select id="de" name="de" required className={campoSelect}>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="para">Passar para</Label>
        <select id="para" name="para" required className={campoSelect} defaultValue={pessoas[1]?.id}>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Passando..." : "Passar leads"}
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Leva todos os leads em aberto, com histórico, reuniões e anotações. Os vendidos continuam com quem vendeu.
      </p>
      {estado.erro && <p role="alert" className="text-sm text-destructive sm:col-span-3">{estado.erro}</p>}
      {estado.ok && <p role="status" className="text-sm text-sucesso sm:col-span-3">{estado.ok}</p>}
    </form>
  );
}
