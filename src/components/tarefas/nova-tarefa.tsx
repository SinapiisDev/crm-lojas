"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { criarTarefa, type Resultado } from "@/app/(app)/tarefas/actions";
import { RECORRENCIAS } from "@/lib/regras/tarefas";

const campoSelect = "h-9 rounded-xl border border-input bg-card px-3 text-sm";

export function NovaTarefa({ pessoas, hoje }: { pessoas: { id: string; nome: string }[] | null; hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, enviando] = useActionState<Resultado, FormData>(async (anterior, form) => {
    const r = await criarTarefa(anterior, form);
    if (r.ok) setAberto(false);
    return r;
  }, {});

  return (
    <>
      <Button onClick={() => setAberto(true)}>Nova tarefa</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
          </DialogHeader>
          <form id="form-nova-tarefa" action={enviar} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" name="titulo" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="descricao">Detalhes (opcional)</Label>
              <Textarea id="descricao" name="descricao" rows={2} />
            </div>
            {pessoas && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="responsavel_id">Responsável</Label>
                <select id="responsavel_id" name="responsavel_id" className={campoSelect}>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prazo">Prazo</Label>
                <Input id="prazo" name="prazo" type="date" min={hoje} defaultValue={hoje} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recorrencia">Repetir</Label>
                <select id="recorrencia" name="recorrencia" className={campoSelect} defaultValue="">
                  <option value="">Não repete</option>
                  {RECORRENCIAS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.titulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {estado.erro && <p className="text-sm text-destructive">{estado.erro}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form="form-nova-tarefa" disabled={enviando}>
              {enviando ? "Salvando..." : "Salvar tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
