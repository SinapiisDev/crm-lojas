"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarReuniao, marcarReuniaoLead, type Resultado } from "@/app/(app)/reunioes/actions";

// Com `lead`: reunião com o cliente, ligada ao lead (a vendedora do lead entra sempre).
export function NovaReuniao({
  pessoas,
  hoje,
  eu,
  lead,
}: {
  pessoas: { id: string; nome: string }[];
  hoje: string;
  eu: string;
  lead?: { id: string; nome: string; vendedorId: string };
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado, FormData>(async (anterior, form) => {
    const r = await (lead ? marcarReuniaoLead : criarReuniao)(anterior, form);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        {lead ? "Marcar reunião" : "Nova reunião"}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lead ? `Reunião com ${lead.nome}` : "Nova reunião"}</DialogTitle>
          </DialogHeader>
          <form id="form-nova-reuniao" action={enviar} className="flex flex-col gap-3">
            {lead && <input type="hidden" name="lead_id" value={lead.id} />}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-titulo">Título</Label>
              <Input id="r-titulo" name="titulo" required maxLength={200} defaultValue={lead ? `Reunião com ${lead.nome}` : undefined} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-data">Data</Label>
                <Input id="r-data" name="data" type="date" defaultValue={hoje} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-hora">Hora</Label>
                <Input id="r-hora" name="hora" type="time" defaultValue="09:00" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r-duracao">Duração</Label>
                <select id="r-duracao" name="duracao" defaultValue="60" className="h-9 rounded-xl border border-input bg-card px-3 text-sm">
                  <option value="30">30 min</option>
                  <option value="60">1 h</option>
                  <option value="90">1h30</option>
                  <option value="120">2 h</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-local">Local ou link</Label>
              <Input id="r-local" name="local" maxLength={300} placeholder="Loja, sala ou link do Meet" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-pauta">Pauta (opcional)</Label>
              <Textarea id="r-pauta" name="pauta" rows={2} />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">
                {lead ? "Mais alguém da loja vai? (você e a vendedora do lead já estão)" : "Participantes (você já está)"}
              </legend>
              {pessoas
                .filter((p) => p.id !== eu && p.id !== lead?.vendedorId)
                .map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="participantes" value={p.id} aria-label={p.nome} />
                    {p.nome}
                  </label>
                ))}
            </fieldset>
            {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form="form-nova-reuniao" disabled={enviando}>
              {enviando ? "Marcando..." : "Marcar reunião"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
