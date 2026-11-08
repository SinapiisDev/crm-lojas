"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { moverLead } from "@/app/(app)/leads/actions";
import { ETAPAS, type Etapa } from "@/lib/regras/leads";
import { cn } from "@/lib/utils";
import { CardLead, type LeadResumo } from "./card-lead";
import { DialogoEtapa, type Extras } from "./dialogo-etapa";

type Pendente = { id: string; etapa: "vendido" | "perdido" };

export function Quadro({
  leads: iniciais,
  diasLimite,
  mostrarVendedor,
}: {
  leads: LeadResumo[];
  diasLimite: number;
  mostrarVendedor: boolean;
}) {
  // Movimento aparece na hora; se o servidor recusar, volta sozinho ao fim da transição.
  const [leads, moverNaTela] = useOptimistic(iniciais, (ls, m: { id: string; etapa: Etapa }) =>
    ls.map((l) => (l.id === m.id ? { ...l, etapa: m.etapa } : l)),
  );
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [, iniciar] = useTransition();
  const acabouDeArrastar = useRef(false);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  function mover(id: string, etapa: Etapa, extras?: Extras) {
    iniciar(async () => {
      moverNaTela({ id, etapa });
      const r = await moverLead(id, etapa, extras);
      if (r.erro) toast.error(r.erro);
    });
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    acabouDeArrastar.current = true;
    setTimeout(() => (acabouDeArrastar.current = false), 0);
    const id = String(e.active.id);
    const destino = e.over?.id as Etapa | undefined;
    const lead = leads.find((l) => l.id === id);
    if (!lead || !destino || destino === lead.etapa) return;
    if (destino === "vendido" || destino === "perdido") setPendente({ id, etapa: destino });
    else mover(id, destino);
  }

  const emArraste = leads.find((l) => l.id === arrastando);

  return (
    <DndContext sensors={sensores} onDragStart={(e) => setArrastando(String(e.active.id))} onDragEnd={aoSoltar} onDragCancel={() => setArrastando(null)}>
      <div
        className="flex snap-x gap-3 overflow-x-auto pb-4"
        onClickCapture={(e) => acabouDeArrastar.current && e.preventDefault()}
      >
        {ETAPAS.map((etapa) => {
          const daColuna = leads.filter((l) => l.etapa === etapa.id);
          return (
            <Coluna key={etapa.id} id={etapa.id} titulo={etapa.titulo} total={daColuna.length}>
              {daColuna.map((l) => (
                <Arrastavel key={l.id} id={l.id}>
                  <CardLead lead={l} diasLimite={diasLimite} mostrarVendedor={mostrarVendedor} />
                </Arrastavel>
              ))}
            </Coluna>
          );
        })}
      </div>
      <DragOverlay>
        {emArraste && <CardLead lead={emArraste} diasLimite={diasLimite} mostrarVendedor={mostrarVendedor} />}
      </DragOverlay>
      <DialogoEtapa
        etapa={pendente?.etapa ?? null}
        onCancelar={() => setPendente(null)}
        onConfirmar={(extras) => {
          mover(pendente!.id, pendente!.etapa, extras);
          setPendente(null);
        }}
      />
    </DndContext>
  );
}

function Coluna({ id, titulo, total, children }: { id: Etapa; titulo: string; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={titulo}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted p-2 transition-colors",
        isOver && "bg-primary/10 ring-2 ring-primary/30",
      )}
    >
      <h2 className="flex justify-between px-1 text-sm font-semibold">
        {titulo} <span className="text-muted-foreground">{total}</span>
      </h2>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

function Arrastavel({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} role="presentation" tabIndex={-1} className={cn("touch-manipulation", isDragging && "opacity-40")}>
      {children}
    </div>
  );
}
