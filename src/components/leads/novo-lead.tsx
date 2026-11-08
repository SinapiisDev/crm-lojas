"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarLead, type Resultado } from "@/app/(app)/leads/actions";
import { ORIGENS } from "@/lib/regras/leads";

const campoSelect = "h-8 rounded-md border bg-background px-2 text-sm";

export function NovoLead({ vendedores }: { vendedores: { id: string; nome: string }[] | null }) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado, FormData>(async (anterior, form) => {
    const r = await criarLead(anterior, form);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <>
      <Button onClick={() => setAberto(true)}>Novo lead</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
          </DialogHeader>
          <form id="form-novo-lead" action={enviar} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" name="telefone" type="tel" placeholder="(11) 98888-7777" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="origem">Origem</Label>
                <select id="origem" name="origem" className={campoSelect} defaultValue="loja_fisica">
                  {ORIGENS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.titulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="valor_estimado">Valor estimado</Label>
                <Input id="valor_estimado" name="valor_estimado" inputMode="decimal" placeholder="R$" />
              </div>
            </div>
            {vendedores && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendedor_id">Responsável</Label>
                <select id="vendedor_id" name="vendedor_id" className={campoSelect}>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form="form-novo-lead" disabled={enviando}>
              {enviando ? "Salvando..." : "Salvar lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
