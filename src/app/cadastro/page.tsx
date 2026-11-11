"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/comum/campo-senha";
import { Marca } from "../login/marca";
import type { Estado } from "../login/actions";
import { cadastrar } from "./actions";

const CAMPOS = [
  { name: "nome", label: "Seu nome", autoComplete: "name", placeholder: "Maria Silva" },
  { name: "empresa", label: "Nome da empresa", autoComplete: "organization", placeholder: "Móveis Silva" },
  { name: "loja", label: "Nome da loja", autoComplete: "off", placeholder: "Loja Centro" },
];

export default function PaginaCadastro() {
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(cadastrar, {});

  return (
    <main className="flex min-h-svh flex-col md:flex-row">
      <Marca />
      <div className="flex flex-1 items-start justify-center p-4 md:items-center md:p-8">
        <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-card-hover">
          <h1 className="text-lg font-semibold">Criar conta da empresa</h1>
          <p className="mb-5 text-sm text-muted-foreground">Você vira dona(o) e depois convida a sua equipe.</p>

          <form action={enviar} className="flex flex-col gap-3">
            {CAMPOS.map((c) => (
              <div key={c.name} className="flex flex-col gap-1.5">
                <Label htmlFor={c.name}>{c.label}</Label>
                <Input id={c.name} name={c.name} autoComplete={c.autoComplete} placeholder={c.placeholder} maxLength={120} required />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@loja.com.br" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senha">Senha</Label>
              <CampoSenha id="senha" name="senha" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmar">Confirmar senha</Label>
              <CampoSenha id="confirmar" name="confirmar" autoComplete="new-password" minLength={8} required />
            </div>

            {estado.erro && <p role="alert" className="text-sm text-destructive">{estado.erro}</p>}

            <Button type="submit" disabled={enviando} className="mt-1">
              {enviando ? "Criando..." : "Criar conta"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm">
            Já tem conta?{" "}
            <Link href="/login" className="underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
