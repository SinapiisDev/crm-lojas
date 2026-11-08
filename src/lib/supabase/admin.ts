import "server-only";
import { createClient } from "@supabase/supabase-js";

// Chave secreta: ignora RLS. Usar só em ações que já checaram permissão.
export function criarClienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}
