"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrar, entrarComGoogle, esqueciSenha, type Estado } from "./actions";

export function FormularioLogin({ erroInicial }: { erroInicial?: string }) {
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const login = useActionState<Estado, FormData>(entrar, { erro: erroInicial });
  const recuperar = useActionState<Estado, FormData>(esqueciSenha, {});
  const [estado, enviar, enviando] = modo === "entrar" ? login : recuperar;

  return (
    <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-card-hover">
      <h1 className="text-lg font-semibold">{modo === "entrar" ? "Entrar" : "Esqueci a senha"}</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {modo === "entrar"
          ? "Use o e-mail que a loja cadastrou."
          : "Enviamos um link para você criar uma nova senha."}
      </p>

      <form action={enviar} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@loja.com.br" />
        </div>
        {modo === "entrar" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="senha">Senha</Label>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setModo("esqueci")}>
                Esqueci a senha
              </button>
            </div>
            <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
          </div>
        )}

        {estado.erro && <p role="alert" className="text-sm text-destructive">{estado.erro}</p>}
        {estado.aviso && <p role="status" className="text-sm text-muted-foreground">{estado.aviso}</p>}

        <Button type="submit" disabled={enviando} className="mt-1">
          {modo === "entrar" ? (enviando ? "Entrando..." : "Entrar") : "Receber link"}
        </Button>
      </form>

      {modo === "entrar" ? (
        <form action={entrarComGoogle} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Entrar com Google
          </Button>
        </form>
      ) : (
        <button type="button" className="mt-4 w-full text-center text-sm underline" onClick={() => setModo("entrar")}>
          Voltar para o login
        </button>
      )}
    </div>
  );
}
