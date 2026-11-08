"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { registrarContato } from "@/app/(app)/leads/actions";

export function RegistrarContato({ id }: { id: string }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      action={() =>
        iniciar(async () => {
          const r = await registrarContato(id, texto);
          setErro(r.erro);
          if (!r.erro) setTexto("");
        })
      }
    >
      <Label htmlFor="contato">O que foi conversado?</Label>
      <Textarea
        id="contato"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex.: achou caro, vai ver com a esposa até sexta"
        rows={2}
      />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando} className="self-start">
        Registrar contato
      </Button>
    </form>
  );
}
