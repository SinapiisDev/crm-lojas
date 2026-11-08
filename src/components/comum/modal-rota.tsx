"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Card aberto por cima do quadro (estilo Trello). Fechar volta para o quadro; recarregar mostra a página inteira.
export function ModalRota({ titulo, children }: { titulo: string; children: ReactNode }) {
  const router = useRouter();
  const caminho = usePathname();
  const [aberturaEm] = useState(caminho);
  // Navegou para outra tela pelo menu: a janela some (o slot do modal guarda o último conteúdo).
  if (caminho !== aberturaEm) return null;
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && router.back()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto bg-background p-4 sm:max-w-2xl">
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
