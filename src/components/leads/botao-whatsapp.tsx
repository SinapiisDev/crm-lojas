"use client";

import { buttonVariants } from "@/components/ui/button";
import { registrarWhatsApp } from "@/app/(app)/leads/actions";

// Link real (abre no celular/desktop) que também registra o contato.
export function BotaoWhatsApp({ id, link, rotulo = "WhatsApp" }: { id: string; link: string; rotulo?: string }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void registrarWhatsApp(id)}
      className={buttonVariants({ variant: "outline" })}
    >
      {rotulo}
    </a>
  );
}
