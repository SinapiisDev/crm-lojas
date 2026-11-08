"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { definirSenha, type Estado } from "../login/actions";

export default function PaginaDefinirSenha() {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(definirSenha, {});
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <form action={enviar} className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
        <h1 className="text-lg font-semibold">Crie sua senha</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="senha">Nova senha (mínimo 8 caracteres)</Label>
          <Input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmar">Repita a senha</Label>
          <Input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {estado.erro && <p role="alert" className="text-sm text-destructive">{estado.erro}</p>}
        <Button type="submit" disabled={enviando}>{enviando ? "Salvando..." : "Salvar e entrar"}</Button>
      </form>
    </main>
  );
}
