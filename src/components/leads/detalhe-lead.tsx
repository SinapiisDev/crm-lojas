import Link from "next/link";
import { notFound } from "next/navigation";
import { AoVivo } from "@/components/comum/ao-vivo";
import { BotaoWhatsApp } from "@/components/leads/botao-whatsapp";
import { EscolherTemperatura } from "@/components/leads/escolher-temperatura";
import { MudarEtapa } from "@/components/leads/mudar-etapa";
import { RegistrarContato } from "@/components/leads/registrar-contato";
import { NovaReuniao } from "@/components/reunioes/nova-reuniao";
import { Sanfona } from "@/components/comum/sanfona";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarDataHora, formatarMoeda, textoSemContato } from "@/lib/formatar";
import { ORIGENS, diasSemContato, linkWhatsApp, type Etapa, type Origem } from "@/lib/regras/leads";
import { hojeSP } from "@/lib/regras/tarefas";
import { obterSessao } from "@/lib/sessao";

const NOME_EVENTO = { criado: "Lead criado", contato: "Contato", whatsapp: "WhatsApp", etapa: "Etapa", reuniao: "Reunião" };

const futura = (iso: string) => Date.parse(iso) >= Date.now();

// Conteúdo do detalhe: página inteira ou janela por cima do quadro (emModal).
export async function DetalheLead({ id, emModal = false }: { id: string; emModal?: boolean }) {
  const { supabase, usuario } = await obterSessao();
  const valido = /^[0-9a-f-]{36}$/i.test(id);
  const [{ data: lead }, { data: eventos }, { data: reunioes }, { data: conversa }] = valido
    ? await Promise.all([
        supabase
          .from("leads")
          .select("id, loja_id, vendedor_id, nome, telefone, origem, etapa, valor_estimado, valor_vendido, motivo_perda, ultimo_contato_em, temperatura, temperatura_manual, resumo_ia, sugestao_ia, ia_em, perfis!leads_vendedor_id_fkey(nome)")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("lead_eventos").select("id, tipo, texto, criado_em, perfis(nome)").eq("lead_id", id).order("criado_em", { ascending: false }),
        supabase.from("reunioes").select("id, titulo, inicio, cancelada, aconteceu").eq("lead_id", id).order("inicio", { ascending: false }),
        supabase.from("whatsapp_mensagens").select("id, de_cliente, tipo, texto, enviada_em").eq("lead_id", id).order("enviada_em", { ascending: false }).limit(50),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];

  // Inexistente ou de outra pessoa (RLS esconde): mesma resposta 404.
  if (!lead) notFound();

  const { data: membros } = await supabase.from("membros").select("perfis(id, nome)").eq("loja_id", lead.loja_id);
  const pessoas = (membros ?? [])
    .map((m) => m.perfis as unknown as { id: string; nome: string } | null)
    .filter((p): p is { id: string; nome: string } => !!p);
  const aberto = !["vendido", "perdido"].includes(lead.etapa);
  // Últimas anotações de contato: o que foi conversado, sem abrir o histórico.
  const anotacoes = (eventos ?? []).filter((e) => e.tipo === "contato" && e.texto).slice(0, 3);
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
            {aberto && (
              <NovaReuniao
                pessoas={pessoas}
                hoje={hojeSP()}
                eu={usuario.id}
                lead={{ id: lead.id, nome: lead.nome, vendedorId: lead.vendedor_id }}
              />
            )}
          </div>
          {/* Só mostra sugestão feita depois do último contato e com o lead em aberto (senão já foi usada). */}
          {lead.sugestao_ia && lead.ia_em && lead.ia_em >= lead.ultimo_contato_em && !["vendido", "perdido"].includes(lead.etapa) && (
            <section aria-label="Sugestão da IA" className="flex flex-col gap-2 rounded-lg bg-sky-50 p-3 text-sky-950">
              <span className="text-xs font-semibold uppercase tracking-wide">Sugestão da IA</span>
              <p className="rounded-md bg-white p-2 italic">{lead.sugestao_ia}</p>
              {linkWhatsApp(lead.telefone, lead.sugestao_ia) && (
                <BotaoWhatsApp id={lead.id} link={linkWhatsApp(lead.telefone, lead.sugestao_ia)!} rotulo="Enviar sugestão no WhatsApp" />
              )}
              <span className="text-xs opacity-70">Revise antes de enviar.</span>
            </section>
          )}
          {aberto && (
            <EscolherTemperatura
              key={`${lead.temperatura}-${lead.temperatura_manual}`}
              id={lead.id}
              temperatura={lead.temperatura as "quente" | "morno" | "frio" | null}
              manual={lead.temperatura_manual}
            />
          )}
          <RegistrarContato id={lead.id} />
        </CardContent>
      </Card>

      <section aria-label="Conversa até agora" className="flex flex-col gap-3 rounded-3xl bg-card p-5 text-sm shadow-card">
        <h2 className="text-base font-semibold tracking-tight">Conversa até agora</h2>
        {lead.resumo_ia && (
          <div className="rounded-2xl bg-sky-50 p-3 text-sky-950">
            <span className="text-xs font-semibold uppercase tracking-wide">Resumo da IA</span>
            <p className="mt-1">{lead.resumo_ia}</p>
          </div>
        )}
        {anotacoes.length ? (
          <ul className="flex flex-col gap-2">
            {anotacoes.map((e) => (
              <li key={e.id} className="border-l-2 pl-3">
                <span className="text-xs text-muted-foreground">{formatarDataHora(e.criado_em)}</span>
                <p className="whitespace-pre-line">{e.texto}</p>
              </li>
            ))}
          </ul>
        ) : (
          !lead.resumo_ia && <p className="text-muted-foreground">Nada anotado ainda. Use “Registrar contato” para anotar o que conversou.</p>
        )}
      </section>

      {!!conversa?.length && (
        <Sanfona titulo="WhatsApp" extra={conversa.length === 50 ? "últimas 50" : conversa.length} aberta>
          <ol className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto text-sm">
            {[...conversa].reverse().map((m) => (
              <li
                key={m.id}
                className={
                  m.de_cliente
                    ? "max-w-[85%] self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2"
                    : "max-w-[85%] self-end rounded-2xl rounded-br-md bg-emerald-100 px-3 py-2 text-emerald-950"
                }
              >
                <p className="whitespace-pre-line">{m.texto ?? <span className="italic text-muted-foreground">[{m.tipo}]</span>}</p>
                <span className="mt-0.5 block text-right text-[10px] opacity-60">{formatarDataHora(m.enviada_em)}</span>
              </li>
            ))}
          </ol>
        </Sanfona>
      )}
      <AoVivo tabela="whatsapp_mensagens" lojaId={lead.loja_id} filtro={`lead_id=eq.${lead.id}`} />

      {!!reunioes?.length && (
        <Sanfona titulo="Reuniões" extra={reunioes.length} aberta={reunioes.some((r) => !r.cancelada && futura(r.inicio))}>
          <ul className="flex flex-col gap-2 text-sm">
            {reunioes.map((r) => (
              <li key={r.id}>
                <Link href={`/reunioes/${r.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-muted">
                  <span className={r.cancelada ? "text-muted-foreground line-through" : "font-medium"}>{r.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatarDataHora(r.inicio)}
                    {r.cancelada ? " · cancelada" : r.aconteceu === true ? " · aconteceu" : r.aconteceu === false ? " · não aconteceu" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Sanfona>
      )}

      <Sanfona titulo="Histórico" extra={eventos?.length || undefined}>
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
      </Sanfona>
    </div>
  );
}
