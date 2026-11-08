import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Etiqueta, estiloCard } from "@/components/comum/quadro";
import { horaSP } from "@/lib/regras/reunioes";

export function CardReuniao({ id, titulo, inicio }: { id: string; titulo: string; inicio: string }) {
  return (
    <Link href={`/reunioes/${id}`} className={estiloCard}>
      <div className="mb-2">
        <Etiqueta cor="azul">Reunião</Etiqueta>
      </div>
      <p className="leading-snug font-medium">{titulo}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-info">
        <CalendarDays className="size-3.5" aria-hidden />
        {horaSP(inicio)}
      </p>
    </Link>
  );
}
