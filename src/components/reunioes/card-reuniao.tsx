import Link from "next/link";
import { horaSP } from "@/lib/regras/reunioes";

export function CardReuniao({ id, titulo, inicio }: { id: string; titulo: string; inicio: string }) {
  return (
    <Link href={`/reunioes/${id}`} className="block rounded-lg border border-l-4 border-l-blue-600 bg-card p-3 text-sm shadow-xs hover:shadow-sm">
      <span className="font-medium">{titulo}</span>
      <span className="mt-1 block text-xs text-blue-700">Reunião · {horaSP(inicio)}</span>
    </Link>
  );
}
