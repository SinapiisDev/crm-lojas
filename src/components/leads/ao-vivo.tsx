"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

// Recarrega os dados da tela quando algum lead da loja muda (outra pessoa mexeu).
export function AoVivo({ lojaId }: { lojaId: string }) {
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
        .channel(`leads-${lojaId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `loja_id=eq.${lojaId}` }, () =>
          router.refresh(),
        )
        .subscribe();
    })();

    return () => {
      ativo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [lojaId, router]);
  return null;
}
