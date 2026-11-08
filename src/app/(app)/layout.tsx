import { Button } from "@/components/ui/button";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { sair } from "../login/actions";
import { Menu } from "./menu";
import { SeletorLoja } from "./seletor-loja";
import { Sino } from "./sino";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const { usuario, lojas, lojaAtual } = await obterSessao();
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <span className="font-semibold">CRM</span>
          <SeletorLoja lojas={lojas} atual={lojaAtual.id} />
          <Menu gestor={lojas.some((l) => podeGerir(l.cargo))} />
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Sino usuarioId={usuario.id} />
            <span className="hidden text-muted-foreground sm:inline">{usuario.nome}</span>
            <form action={sair}>
              <Button type="submit" variant="ghost" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
