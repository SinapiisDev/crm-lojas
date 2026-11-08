"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { removerInscricao, salvarInscricao } from "@/app/(app)/avisos/actions";

type Estado = "carregando" | "sem-suporte" | "ios-instalar" | "bloqueado" | "inativo" | "ativo" | "erro";

function chaveVapid(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function AtivarNotificacoes() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const instalado = window.matchMedia("(display-mode: standalone)").matches;
        return setEstado(ios && !instalado ? "ios-instalar" : "sem-suporte");
      }
      const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const inscricao = await registro.pushManager.getSubscription();
      setEstado(inscricao ? "ativo" : Notification.permission === "denied" ? "bloqueado" : "inativo");
    })();
  }, []);

  async function ativar() {
    setOcupado(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueado");
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveVapid(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const r = await salvarInscricao(inscricao.toJSON());
      if (r.erro) await inscricao.unsubscribe();
      setEstado(r.erro ? "sem-suporte" : "ativo");
    } catch (e) {
      console.error("ativar notificações falhou", e);
      setEstado("erro");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    const inscricao = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (inscricao) {
      await removerInscricao(inscricao.endpoint);
      await inscricao.unsubscribe();
    }
    setEstado("inativo");
    setOcupado(false);
  }

  const caixa = "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm";
  if (estado === "carregando") return null;
  if (estado === "ativo")
    return (
      <div className={caixa}>
        <span>Notificações ativas neste aparelho.</span>
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={desativar}>
          Desativar
        </Button>
      </div>
    );
  if (estado === "inativo" || estado === "erro")
    return (
      <div className={caixa}>
        <span>
          {estado === "erro"
            ? "Não foi possível ativar agora. Tente de novo em instantes."
            : "Receba os avisos no celular, mesmo com o CRM fechado."}
        </span>
        <Button size="sm" disabled={ocupado} onClick={ativar}>
          Ativar notificações neste aparelho
        </Button>
      </div>
    );
  const textos: Record<string, string> = {
    bloqueado: "As notificações estão bloqueadas neste navegador. Libere nas configurações do site para receber os avisos.",
    "ios-instalar":
      "No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o CRM pelo ícone e ative as notificações aqui.",
    "sem-suporte": "Este navegador não recebe notificações. Os avisos chegam por e-mail.",
  };
  return <p className={caixa}>{textos[estado]}</p>;
}
