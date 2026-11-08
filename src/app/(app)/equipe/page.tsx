import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { cancelarConvite } from "./actions";
import { FormularioConvite } from "./formulario-convite";

const NOME_CARGO = { dono: "Dono(a)/Sócio(a)", gerente: "Gerente", vendedor: "Vendedor(a)", conferente: "Conferente" };

export default async function PaginaEquipe() {
  const { supabase, lojaAtual } = await obterSessao();
  const gere = podeGerir(lojaAtual.cargo);
  const [{ data: membros }, { data: convites }] = await Promise.all([
    supabase.from("membros").select("cargo, perfis(id, nome, email)").eq("loja_id", lojaAtual.id),
    gere
      ? supabase.from("convites").select("id, email, cargo").eq("loja_id", lojaAtual.id).is("aceito_em", null)
      : Promise.resolve({ data: [] as { id: string; email: string; cargo: keyof typeof NOME_CARGO }[] }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Equipe · {lojaAtual.nome}</h1>

      {gere && (
        <Card>
          <CardHeader>
            <CardTitle>Convidar pessoa</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioConvite podeConvidarDono={lojaAtual.cargo === "dono"} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pessoas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(membros ?? []).map((m) => {
              const p = m.perfis as unknown as { id: string; nome: string; email: string };
              return (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{p.nome}</span> <span className="text-muted-foreground">{p.email}</span>
                  </span>
                  <span>{NOME_CARGO[m.cargo as keyof typeof NOME_CARGO]}</span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {gere && !!convites?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {convites.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {c.email} · {NOME_CARGO[c.cargo as keyof typeof NOME_CARGO]}
                  </span>
                  <form action={cancelarConvite.bind(null, c.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Cancelar
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
