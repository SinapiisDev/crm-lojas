import { Clock } from "lucide-react";
import Link from "next/link";
import { Etiqueta, estiloCard, type CorEtiqueta } from "@/components/comum/quadro";
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

const TEMPERATURA: Record<string, { texto: string; cor: CorEtiqueta }> = {
  quente: { texto: "Quente", cor: "vermelho" },
  morno: { texto: "Morno", cor: "ambar" },
  frio: { texto: "Frio", cor: "azul" },
};
const COR_ORIGEM: Record<Origem, CorEtiqueta> = {
  instagram: "rosa",
  loja_fisica: "cinza",
  prospeccao: "roxo",
  indicacao: "verde",
  outro: "cinza",
};

export function CardLead({ lead, diasLimite, mostrarVendedor }: { lead: LeadResumo; diasLimite: number; mostrarVendedor: boolean }) {
  const parado = leadParado(lead, diasLimite);
  const aberto = lead.etapa !== "vendido" && lead.etapa !== "perdido";
  const valor = lead.etapa === "vendido" ? lead.valor_vendido : lead.valor_estimado;
  return (
    <Link href={`/leads/${lead.id}`} draggable={false} className={cn(estiloCard, parado && "ring-1 ring-destructive/40")}>
      <div className="mb-2 flex flex-wrap gap-1">
        {parado && <Etiqueta cor="vermelho">Parado</Etiqueta>}
        {lead.temperatura && aberto && <Etiqueta cor={TEMPERATURA[lead.temperatura].cor}>{TEMPERATURA[lead.temperatura].texto}</Etiqueta>}
        <Etiqueta cor={COR_ORIGEM[lead.origem]}>{ORIGENS.find((o) => o.id === lead.origem)?.titulo}</Etiqueta>
        {lead.etapa === "vendido" && <Etiqueta cor="verde">Vendido</Etiqueta>}
      </div>
      <p className="leading-snug font-medium">{lead.nome}</p>
      {valor != null && <p className="mt-0.5 text-xs font-semibold">{formatarMoeda(valor)}</p>}
      {(aberto || (mostrarVendedor && lead.vendedor)) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {aberto && (
            <span className={cn("flex items-center gap-1", parado && "font-medium text-destructive")}>
              <Clock className="size-3.5" aria-hidden />
              {textoSemContato(diasSemContato(lead.ultimo_contato_em))}
            </span>
          )}
          {mostrarVendedor && lead.vendedor && <span className="ml-auto truncate">{lead.vendedor}</span>}
        </div>
      )}
    </Link>
  );
}
