"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogoAcao } from "@/components/tarefas/dialogo-acao";
import { cancelarReuniao, registrarReuniao, remarcarReuniao } from "@/app/(app)/reunioes/actions";

export function RegistrarReuniao({ id }: { id: string }) {
  const [aconteceu, setAconteceu] = useState<boolean | null>(null);
  const [ata, setAta] = useState("");
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3"
      action={() =>
        iniciar(async () => {
          if (aconteceu === null) return setErro("Diga se a reunião aconteceu.");
          const r = await registrarReuniao(id, aconteceu, ata);
          setErro(r.erro);
        })
      }
    >
      <p className="text-sm font-medium">Como foi?</p>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="aconteceu" onChange={() => setAconteceu(true)} /> Aconteceu
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="aconteceu" onChange={() => setAconteceu(false)} /> Não aconteceu
        </label>
      </div>
      <Label htmlFor="ata">Ata</Label>
      <Textarea id="ata" rows={3} value={ata} onChange={(e) => setAta(e.target.value)} placeholder="O que foi decidido, quem faz o quê" />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" disabled={salvando} className="self-start">
        Registrar
      </Button>
    </form>
  );
}

export function Remarcar({ id, data, hora, duracao }: { id: string; data: string; hora: string; duracao: number }) {
  return (
    <DialogoAcao
      botao="Remarcar"
      titulo="Remarcar reunião"
      confirmar="Salvar novo horário"
      variante="outline"
      acao={(f) => remarcarReuniao(id, String(f.get("data")), String(f.get("hora")), Number(f.get("duracao")))}
    >
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rm-data">Data</Label>
          <Input id="rm-data" name="data" type="date" defaultValue={data} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rm-hora">Hora</Label>
          <Input id="rm-hora" name="hora" type="time" defaultValue={hora} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rm-duracao">Minutos</Label>
          <Input id="rm-duracao" name="duracao" type="number" min={15} max={600} defaultValue={duracao} />
        </div>
      </div>
    </DialogoAcao>
  );
}

export function Cancelar({ id }: { id: string }) {
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      variant="ghost"
      disabled={enviando}
      onClick={() =>
        confirm("Cancelar a reunião? Os participantes recebem o cancelamento na agenda.") &&
        iniciar(async () => {
          const r = await cancelarReuniao(id);
          if (r.erro) toast.error(r.erro);
        })
      }
    >
      Cancelar reunião
    </Button>
  );
}
