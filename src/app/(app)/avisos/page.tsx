import Link from "next/link";
import { AtivarNotificacoes } from "@/components/comum/ativar-notificacoes";
import { LinkAgenda } from "@/components/comum/link-agenda";
import { JaMandei } from "@/components/leads/ja-mandei";
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
  // Aviso de lead parado com atalho do WhatsApp: ganha o botão "Já mandei". Resolvido = contato depois do aviso.
  const leadDoAviso = (link: string | null) =>
    /^\/leads\/([0-9a-f-]{36})\/whatsapp$/.exec(link ?? "")?.[1];
  const ids = [
    ...new Set(
      (avisos ?? [])
        .map((a) => leadDoAviso(a.link))
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: leads } = ids.length
    ? await supabase.from("leads").select("id, ultimo_contato_em").in("id", ids)
    : { data: [] };
  const contato = new Map(
    (leads ?? []).map((l) => [l.id, l.ultimo_contato_em]),
  );
  // Abriu a lista = leu. Os não lidos ainda aparecem destacados nesta visita.
  await supabase.rpc("marcar_avisos_lidos");
  const { data: token } = await supabase.rpc("meu_token_agenda");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
      <AtivarNotificacoes />
      {token && (
        <LinkAgenda
          endereco={`${process.env.NEXT_PUBLIC_SITE_URL}/agenda/${token}.ics`}
        />
      )}
      {!avisos?.length && (
        <p className="text-muted-foreground">Nenhum aviso por enquanto.</p>
      )}
      <ul className="flex flex-col gap-2">
        {(avisos ?? []).map((a) => {
          const lead = leadDoAviso(a.link);
          const ultimo = lead && contato.get(lead);
          return (
            <li key={a.id} className="flex flex-col gap-1">
              <Link
                href={a.link ?? "#"}
                prefetch={lead ? false : undefined}
                className={cn(
                  "block rounded-lg border bg-card p-3 text-sm",
                  !a.lida_em && "border-l-4 border-l-primary",
                )}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{a.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatarDataHora(a.criado_em)}
                  </span>
                </div>
                {a.texto && (
                  <p className="mt-1 text-muted-foreground">{a.texto}</p>
                )}
              </Link>
              {lead && ultimo && (
                <JaMandei id={lead} registrado={Date.parse(ultimo) > Date.parse(a.criado_em)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
