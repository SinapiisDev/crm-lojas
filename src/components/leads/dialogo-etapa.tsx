"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOTIVOS_PERDA, validarMudancaEtapa } from "@/lib/regras/leads";

export type Extras = { valorVendido?: number; motivoPerda?: string };

// Pede o valor (Vendido) ou o motivo (Perdido) antes de mover o lead.
export function DialogoEtapa({
  etapa,
  onConfirmar,
  onCancelar,
}: {
  etapa: "vendido" | "perdido" | null;
  onConfirmar: (extras: Extras) => void;
  onCancelar: () => void;
}) {
  const [erro, setErro] = useState<string>();

  function confirmar(form: FormData) {
    const extras: Extras =
      etapa === "vendido"
        ? { valorVendido: Number(String(form.get("valor") ?? "").replace(",", ".")) }
        : {
            motivoPerda: [form.get("motivo"), String(form.get("detalhe") ?? "").trim()].filter(Boolean).join(": "),
          };
    const problema = validarMudancaEtapa(etapa!, extras);
    if (problema) return setErro(problema);
    setErro(undefined);
    onConfirmar(extras);
  }

  return (
    <Dialog
      open={etapa !== null}
      onOpenChange={(aberto) => {
        if (!aberto) {
          setErro(undefined);
          onCancelar();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{etapa === "vendido" ? "Venda fechada" : "Lead perdido"}</DialogTitle>
        </DialogHeader>
        <form id="form-etapa" action={confirmar} className="flex flex-col gap-3">
          {etapa === "vendido" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor">Valor vendido</Label>
              <Input id="valor" name="valor" inputMode="decimal" placeholder="Ex.: 15000" autoFocus />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motivo">Motivo da perda</Label>
                <select id="motivo" name="motivo" className="h-8 rounded-md border bg-background px-2 text-sm" defaultValue="">
                  <option value="" disabled>
                    Escolha
                  </option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="detalhe">Detalhe (opcional)</Label>
                <Input id="detalhe" name="detalhe" />
              </div>
            </>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-etapa">
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
