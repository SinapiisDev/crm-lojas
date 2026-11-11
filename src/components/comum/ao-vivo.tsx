"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Recarrega os dados da tela quando alguma linha da loja muda (outra pessoa mexeu, ou chegou mensagem).
export function AoVivo({ tabela, lojaId, filtro }: { tabela: "leads" | "tarefas" | "whatsapp_mensagens"; lojaId: string; filtro?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = criarClienteNavegador();
    let canal: ReturnType<typeof supabase.channel> | undefined;
    let ativo = true;

    (async () => {
      // Sem o token do usuário o canal entra como anônimo e o RLS não deixa passar nenhum evento.
      const { data } = await supabase.auth.getSession();
      if (!ativo || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      canal = supabase
        .channel(`${tabela}-${lojaId}-${filtro ?? ""}`)
        .on("postgres_changes", { event: "*", schema: "public", table: tabela, filter: filtro ?? `loja_id=eq.${lojaId}` }, () =>
          router.refresh(),
        )
        .subscribe();
    })();

    return () => {
      ativo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [tabela, lojaId, filtro, router]);
  return null;
}
