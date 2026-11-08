"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cobrar, decidirNovoPrazo, pedirNovoPrazo } from "@/app/(app)/tarefas/actions";
import { DialogoAcao } from "./dialogo-acao";

export function Cobrar({ id, mensagem }: { id: string; mensagem: string }) {
  return (
    <DialogoAcao botao="Cobrar" titulo="Cobrar tarefa" confirmar="Enviar cobrança" acao={(f) => cobrar(id, String(f.get("mensagem") ?? ""))}>
      <Label htmlFor="mensagem">Mensagem</Label>
      <Textarea id="mensagem" name="mensagem" defaultValue={mensagem} rows={3} required />
    </DialogoAcao>
  );
}

export function PedirPrazo({ id, hoje }: { id: string; hoje: string }) {
  return (
    <DialogoAcao
      botao="Pedir novo prazo"
      titulo="Pedir novo prazo"
      confirmar="Enviar pedido"
      variante="outline"
      acao={(f) => pedirNovoPrazo(id, String(f.get("prazo") ?? ""), String(f.get("motivo") ?? ""))}
    >
      <Label htmlFor="prazo">Novo prazo</Label>
      <Input id="prazo" name="prazo" type="date" min={hoje} required />
      <Label htmlFor="motivo">Motivo</Label>
      <Textarea id="motivo" name="motivo" rows={2} required placeholder="Ex.: cliente pediu para esperar a medida da obra" />
    </DialogoAcao>
  );
}

export function DecidirPrazo({ id }: { id: string }) {
  const [enviando, iniciar] = useTransition();
  const decidir = (aprovar: boolean) =>
    iniciar(async () => {
      const r = await decidirNovoPrazo(id, aprovar);
      if (r.erro) toast.error(r.erro);
    });
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={enviando} onClick={() => decidir(true)}>
        Aprovar
      </Button>
      <Button size="sm" variant="outline" disabled={enviando} onClick={() => decidir(false)}>
        Recusar
      </Button>
    </div>
  );
}
