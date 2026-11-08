import Link from "next/link";
import { AtivarNotificacoes } from "@/components/comum/ativar-notificacoes";
import { formatarDataHora } from "@/lib/formatar";
import { obterSessao } from "@/lib/sessao";
import { cn } from "@/lib/utils";

export default async function PaginaAvisos() {
  const { supabase } = await obterSessao();
  const { data: avisos } = await supabase
    .from("notificacoes")
    .select("id, titulo, texto, link, lida_em, criado_em")
    .order("criado_em", { ascending: false })
    .limit(50);
  // Abriu a lista = leu. Os não lidos ainda aparecem destacados nesta visita.
  await supabase.rpc("marcar_avisos_lidos");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="text-xl font-semibold">Avisos</h1>
      <AtivarNotificacoes />
      {!avisos?.length && <p className="text-muted-foreground">Nenhum aviso por enquanto.</p>}
      <ul className="flex flex-col gap-2">
        {(avisos ?? []).map((a) => (
          <li key={a.id}>
            <Link
              href={a.link ?? "#"}
              className={cn("block rounded-lg border bg-card p-3 text-sm", !a.lida_em && "border-l-4 border-l-primary")}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium">{a.titulo}</span>
                <span className="text-xs text-muted-foreground">{formatarDataHora(a.criado_em)}</span>
              </div>
              {a.texto && <p className="mt-1 text-muted-foreground">{a.texto}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
