"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Resultado } from "@/app/(app)/tarefas/actions";

// Botão que abre um formulário curto num diálogo e roda uma ação do servidor.
export function DialogoAcao({
  botao,
  titulo,
  confirmar,
  variante = "default",
  acao,
  children,
}: {
  botao: string;
  titulo: string;
  confirmar: string;
  variante?: "default" | "outline";
  acao: (form: FormData) => Promise<Resultado>;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [enviando, iniciar] = useTransition();
  const idForm = `form-${botao.replace(/\W/g, "")}`;

  return (
    <>
      <Button variant={variante} onClick={() => setAberto(true)}>
        {botao}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <form
            id={idForm}
            className="flex flex-col gap-3"
            action={(form) =>
              iniciar(async () => {
                const r = await acao(form);
                setErro(r.erro);
                if (!r.erro) setAberto(false);
              })
            }
          >
            {children}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form={idForm} disabled={enviando}>
              {enviando ? "Enviando..." : confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
