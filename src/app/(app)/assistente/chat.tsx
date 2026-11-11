"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatarMoeda } from "@/lib/formatar";
import type { Mensagem, Proposta, PropostaLead } from "@/lib/ia/assistente";
import { ETAPAS, ORIGENS } from "@/lib/regras/leads";
import { conversar, criarPropostas } from "./actions";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

export function ChatAssistente({ primeiroNome }: { primeiroNome: string }) {
  const [conversa, setConversa] = useState<Mensagem[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [leads, setLeads] = useState<PropostaLead[]>([]);
  const [feito, setFeito] = useState("");
  const [pensando, iniciar] = useTransition();

  function enviar() {
    const pedido = texto.trim();
    if (!pedido || pensando) return;
    const nova = [...conversa, { autor: "voce" as const, texto: pedido }];
    setConversa(nova);
    setTexto("");
    setErro("");
    setFeito("");
    iniciar(async () => {
      const r = await conversar(nova, propostas, leads);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setConversa([...nova, { autor: "ia", texto: r.resposta }]);
      setPropostas(r.tarefas);
      setLeads(r.leads);
    });
  }

  function confirmar() {
    setErro("");
    iniciar(async () => {
      const r = await criarPropostas(propostas, leads);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      const partes = [r.criadas && plural(r.criadas, "tarefa criada", "tarefas criadas"), r.leads && plural(r.leads, "lead criado", "leads criados")];
      setFeito(partes.filter(Boolean).join(" e ") + ".");
      if (r.falhas) setErro(`${plural(r.falhas, "lead não pôde", "leads não puderam")} ser salvo(s).`);
      setPropostas([]);
      setLeads([]);
      setConversa([]);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Conversa" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
        {!conversa.length && (
          <p className="text-sm text-muted-foreground">
            Oi, {primeiroNome}! Ex.: “Ana liga para o Paulo até sexta e o Bruno arruma a vitrine amanhã” ou “Chegou a Maria pelo
            Instagram, 42 99999-0000, quer um sofá de uns 3 mil, a Ana atende”.
          </p>
        )}
        {conversa.map((m, i) => (
          <p
            key={i}
            className={
              m.autor === "voce"
                ? "max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "max-w-[85%] self-start rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm"
            }
          >
            {m.texto}
          </p>
        ))}
        {pensando && <p className="self-start text-sm text-muted-foreground">Pensando...</p>}
        {feito && (
          <p role="status" className="text-sm">
            {feito}{" "}
            <Link href="/tarefas" className="underline">
              Ver tarefas
            </Link>{" "}
            ·{" "}
            <Link href="/leads" className="underline">
              Ver leads
            </Link>
          </p>
        )}
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <Textarea
            aria-label="Mensagem para o assistente"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Tarefa para a equipe ou cliente novo?"
          />
          <Button type="submit" disabled={pensando || !texto.trim()}>
            Enviar
          </Button>
        </form>
      </section>

      {leads.length > 0 && (
        <section aria-label="Leads propostos" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold tracking-tight">Leads propostos</h2>
          <ul className="flex flex-col gap-2">
            {leads.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {l.nome} <span className="text-xs font-normal text-muted-foreground">→ {ETAPAS.find((e) => e.id === l.etapa)?.titulo}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.vendedor} · {l.loja} · {ORIGENS.find((o) => o.id === l.origem)?.titulo}
                    {l.telefone && ` · ${l.telefone}`}
                    {l.valor_estimado != null && ` · ${formatarMoeda(l.valor_estimado)}`}
                  </p>
                  {l.resumo && <p className="mt-1 text-xs">{l.resumo}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Tirar ${l.nome}`}
                  onClick={() => setLeads(leads.filter((_, j) => j !== i))}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {propostas.length > 0 && (
        <section aria-label="Tarefas propostas" className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-card">
          <h2 className="text-base font-semibold tracking-tight">Tarefas propostas</h2>
          <ul className="flex flex-col gap-2">
            {propostas.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
                <div>
                  <p className="font-medium">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.responsavel} · {t.loja} · até {ddmm(t.prazo)}
                  </p>
                  {t.descricao && <p className="mt-1 text-xs">{t.descricao}</p>}
                </div>
                <button
                  type="button"
                  aria-label={`Tirar ${t.titulo}`}
                  onClick={() => setPropostas(propostas.filter((_, j) => j !== i))}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(propostas.length > 0 || leads.length > 0) && (
        <Button onClick={confirmar} disabled={pensando} className="self-end">
          Criar {[propostas.length && plural(propostas.length, "tarefa", "tarefas"), leads.length && plural(leads.length, "lead", "leads")].filter(Boolean).join(" e ")}
        </Button>
      )}
    </div>
  );
}
