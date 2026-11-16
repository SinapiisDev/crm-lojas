"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/comum/campo-senha";
import { convidar, type EstadoConvite } from "./actions";

const CARGOS = [
  { id: "vendedor", titulo: "Vendedor(a)" },
  { id: "conferente", titulo: "Conferente" },
  { id: "gerente", titulo: "Gerente" },
  { id: "dono", titulo: "Dono(a) / Sócio(a)" },
];

export function FormularioConvite({ podeConvidarDono }: { podeConvidarDono: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoConvite, FormData>(convidar, {});
  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_1fr_auto] sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cargo">Cargo</Label>
        <select id="cargo" name="cargo" className="h-9 rounded-xl border border-input bg-card px-3 text-sm" defaultValue="vendedor">
          {CARGOS.filter((c) => podeConvidarDono || c.id !== "dono").map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Senha inicial (opcional)</Label>
        <CampoSenha id="senha" name="senha" autoComplete="new-password" minLength={8} placeholder="Vazio = convite por e-mail" />
      </div>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Enviando..." : "Convidar"}
      </Button>
      {estado.erro && <p role="alert" className="text-sm text-destructive sm:col-span-5">{estado.erro}</p>}
      {estado.ok && <p role="status" className="text-sm text-green-700 sm:col-span-5">{estado.ok}</p>}
    </form>
  );
}
