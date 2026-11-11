"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/comum/campo-senha";
import { Label } from "@/components/ui/label";
import { definirSenha, type Estado } from "../login/actions";

export default function PaginaDefinirSenha() {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(definirSenha, {});
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <form action={enviar} className="flex w-full max-w-sm flex-col gap-3 rounded-3xl bg-card p-7 shadow-card-hover">
        <h1 className="text-lg font-semibold">Crie sua senha</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="senha">Nova senha (mínimo 8 caracteres)</Label>
          <CampoSenha id="senha" name="senha" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmar">Repita a senha</Label>
          <CampoSenha id="confirmar" name="confirmar" autoComplete="new-password" minLength={8} required />
        </div>
        {estado.erro && <p role="alert" className="text-sm text-destructive">{estado.erro}</p>}
        <Button type="submit" disabled={enviando}>{enviando ? "Salvando..." : "Salvar e entrar"}</Button>
      </form>
    </main>
  );
}
