import { LogOut } from "lucide-react";
import { obterSessao, podeGerir } from "@/lib/sessao";
import { sair } from "../login/actions";
import { Menu } from "./menu";
import { SeletorLoja } from "./seletor-loja";
import { Sino } from "./sino";

function Logo({ compacto }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight whitespace-nowrap">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">C</span>
      {compacto ? <span className="sr-only">CRM Lojas</span> : "CRM Lojas"}
    </span>
  );
}

function BotaoSair({ comTexto }: { comTexto?: boolean }) {
  return (
    <form action={sair}>
      <button
        type="submit"
        aria-label="Sair"
        className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden />
        {comTexto && <span aria-hidden>Sair</span>}
      </button>
    </form>
  );
}

export default async function LayoutApp({ children, modal }: LayoutProps<"/">) {
  const { usuario, lojas, lojaAtual } = await obterSessao();
  const gestor = lojas.some((l) => podeGerir(l.cargo));
  const primeiroNome = usuario.nome.split(" ")[0];
  const iniciais = usuario.nome
    .split(" ")
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-5 md:p-5">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-5 hidden h-[calc(100svh-2.5rem)] flex-col gap-6 rounded-3xl bg-sidebar p-5 shadow-card md:flex">
        <Logo />
        <Menu gestor={gestor} />
        <SeletorLoja lojas={lojas} atual={lojaAtual.id} comRotulo />
        <div className="mt-auto">
          <BotaoSair comTexto />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 px-4 pt-4 pb-3 md:px-1 md:pt-1 md:pb-5">
          <span className="md:hidden">
            <Logo compacto />
          </span>
          <p className="hidden text-3xl font-semibold tracking-tight md:block">Olá, {primeiroNome}!</p>
          <div className="ml-auto flex items-center gap-2">
            <span className="md:hidden">
              <SeletorLoja lojas={lojas} atual={lojaAtual.id} />
            </span>
            <Sino usuarioId={usuario.id} />
            <span
              title={usuario.nome}
              className="hidden size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground md:grid"
            >
              {iniciais}
            </span>
            <span className="md:hidden">
              <BotaoSair />
            </span>
          </div>
        </header>
        <main className="flex-1 px-4 pb-28 md:px-1 md:pb-2">{children}</main>
      </div>

      {/* Barra inferior (celular) */}
      <div className="fixed inset-x-3 bottom-3 z-20 rounded-3xl bg-card p-1.5 shadow-card-hover md:hidden">
        <Menu gestor={gestor} variante="inferior" />
      </div>
      {modal}
    </div>
  );
}
