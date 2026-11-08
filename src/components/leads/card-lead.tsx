import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatarMoeda, textoSemContato } from "@/lib/formatar";
import { ORIGENS, diasSemContato, leadParado, type Etapa, type Origem } from "@/lib/regras/leads";
import { cn } from "@/lib/utils";

export type LeadResumo = {
  id: string;
  nome: string;
  origem: Origem;
  etapa: Etapa;
  valor_estimado: number | null;
  valor_vendido: number | null;
  ultimo_contato_em: string;
  vendedor: string | null;
  temperatura: "quente" | "morno" | "frio" | null;
};

const TEMPERATURA = {
  quente: { texto: "Quente", cor: "text-red-700" },
  morno: { texto: "Morno", cor: "text-amber-700" },
  frio: { texto: "Frio", cor: "text-sky-700" },
};

export function CardLead({ lead, diasLimite, mostrarVendedor }: { lead: LeadResumo; diasLimite: number; mostrarVendedor: boolean }) {
  const parado = leadParado(lead, diasLimite);
  const valor = lead.etapa === "vendido" ? lead.valor_vendido : lead.valor_estimado;
  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable={false}
      className={cn(
        "block rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:shadow-sm",
        parado && "border-l-4 border-l-destructive",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{lead.nome}</span>
        {parado && <Badge variant="destructive">Parado</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span>{ORIGENS.find((o) => o.id === lead.origem)?.titulo}</span>
        {valor != null && <span>{formatarMoeda(valor)}</span>}
        {lead.temperatura && <span className={cn("font-medium", TEMPERATURA[lead.temperatura].cor)}>{TEMPERATURA[lead.temperatura].texto}</span>}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs">
        {lead.etapa !== "vendido" && lead.etapa !== "perdido" && (
          <span className={cn(parado ? "text-destructive" : "text-muted-foreground")}>
            {textoSemContato(diasSemContato(lead.ultimo_contato_em))}
          </span>
        )}
        {mostrarVendedor && lead.vendedor && <span className="ml-auto text-muted-foreground">{lead.vendedor}</span>}
      </div>
    </Link>
  );
}
