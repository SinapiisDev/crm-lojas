"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Contador de avisos não lidos: recarrega a cada navegação e quando chega aviso novo.
export function Sino({ usuarioId }: { usuarioId: string }) {
  const caminho = usePathname();
  const [naoLidos, setNaoLidos] = useState(0);

  useEffect(() => {
    const supabase = criarClienteNavegador();
    let ativo = true;
    let canal: ReturnType<typeof supabase.channel> | undefined;
    const contar = async () => {
      const { count } = await supabase
        .from("notificacoes")
        .select("id", { count: "exact", head: true })
        .is("lida_em", null);
      if (ativo) setNaoLidos(count ?? 0);
    };
    (async () => {
      await contar();
      const { data } = await supabase.auth.getSession();
      if (!ativo || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      canal = supabase
        .channel(`avisos-${usuarioId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notificacoes", filter: `usuario_id=eq.${usuarioId}` }, contar)
        .subscribe();
    })();
    return () => {
      ativo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [caminho, usuarioId]);

  const rotulo = naoLidos ? `Avisos: ${naoLidos} ${naoLidos === 1 ? "não lido" : "não lidos"}` : "Avisos";
  return (
    // Abrir /avisos marca tudo como lido; sem prefetch para um hover não "ler" os avisos.
    <Link href="/avisos" prefetch={false} aria-label={rotulo} className="relative grid size-10 place-items-center rounded-full bg-card shadow-card transition-colors hover:bg-muted">
      <Bell className="size-[18px]" aria-hidden />
      {naoLidos > 0 && (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-4.5 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold text-white">
          {naoLidos}
        </span>
      )}
    </Link>
  );
}
