import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoWhatsApp } from "@/components/leads/botao-whatsapp";
import { MudarEtapa } from "@/components/leads/mudar-etapa";
import { RegistrarContato } from "@/components/leads/registrar-contato";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHora, formatarMoeda, textoSemContato } from "@/lib/formatar";
import { ORIGENS, diasSemContato, linkWhatsApp, type Etapa, type Origem } from "@/lib/regras/leads";
import { obterSessao } from "@/lib/sessao";

const NOME_EVENTO = { criado: "Lead criado", contato: "Contato", whatsapp: "WhatsApp", etapa: "Etapa" };

// Conteúdo do detalhe: página inteira ou janela por cima do quadro (emModal).
export async function DetalheLead({ id, emModal = false }: { id: string; emModal?: boolean }) {
  const { supabase } = await obterSessao();
  const valido = /^[0-9a-f-]{36}$/i.test(id);
  const [{ data: lead }, { data: eventos }] = valido
    ? await Promise.all([
        supabase
          .from("leads")
          .select("id, nome, telefone, origem, etapa, valor_estimado, valor_vendido, motivo_perda, ultimo_contato_em, resumo_ia, sugestao_ia, ia_em, perfis!leads_vendedor_id_fkey(nome)")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("lead_eventos").select("id, tipo, texto, criado_em, perfis(nome)").eq("lead_id", id).order("criado_em", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  // Inexistente ou de outra pessoa (RLS esconde): mesma resposta 404.
  if (!lead) notFound();

  const zap = linkWhatsApp(lead.telefone, `Oi ${lead.nome.split(" ")[0]}, tudo bem?`);
  const vendedor = (lead.perfis as unknown as { nome: string } | null)?.nome;

  return (
    <div className={emModal ? "flex flex-col gap-4" : "mx-auto flex max-w-2xl flex-col gap-4"}>
      {!emModal && (<Link href="/leads" className="text-sm text-muted-foreground underline">
        ← Leads
      </Link>)}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{lead.nome}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd>{lead.telefone || "—"}</dd>
            <dt className="text-muted-foreground">Origem</dt>
            <dd>{ORIGENS.find((o) => o.id === (lead.origem as Origem))?.titulo}</dd>
            <dt className="text-muted-foreground">Valor estimado</dt>
            <dd>{formatarMoeda(lead.valor_estimado) || "—"}</dd>
            <dt className="text-muted-foreground">Responsável</dt>
            <dd>{vendedor}</dd>
            <dt className="text-muted-foreground">Último contato</dt>
            <dd>{textoSemContato(diasSemContato(lead.ultimo_contato_em))}</dd>
          </dl>
          <div className="flex flex-wrap items-end gap-3">
            <MudarEtapa key={lead.etapa} id={lead.id} etapa={lead.etapa as Etapa} />
            {zap && <BotaoWhatsApp id={lead.id} link={zap} />}
          </div>
          {/* Só mostra sugestão feita depois do último contato e com o lead em aberto (senão já foi usada). */}
          {lead.sugestao_ia && lead.ia_em && lead.ia_em >= lead.ultimo_contato_em && !["vendido", "perdido"].includes(lead.etapa) && (
            <section aria-label="Sugestão da IA" className="flex flex-col gap-2 rounded-lg bg-sky-50 p-3 text-sky-950">
              <span className="text-xs font-semibold uppercase tracking-wide">Sugestão da IA</span>
              {lead.resumo_ia && <p>{lead.resumo_ia}</p>}
              <p className="rounded-md bg-white p-2 italic">{lead.sugestao_ia}</p>
              {linkWhatsApp(lead.telefone, lead.sugestao_ia) && (
                <BotaoWhatsApp id={lead.id} link={linkWhatsApp(lead.telefone, lead.sugestao_ia)!} rotulo="Enviar sugestão no WhatsApp" />
              )}
              <span className="text-xs opacity-70">Revise antes de enviar.</span>
            </section>
          )}
          <RegistrarContato id={lead.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 text-sm">
            {(eventos ?? []).map((e) => (
              <li key={e.id} className="border-l-2 pl-3">
                <div className="text-xs text-muted-foreground">
                  {formatarDataHora(e.criado_em)} · {(e.perfis as unknown as { nome: string } | null)?.nome} ·{" "}
                  {NOME_EVENTO[e.tipo as keyof typeof NOME_EVENTO]}
                </div>
                {e.texto && <p>{e.texto}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
