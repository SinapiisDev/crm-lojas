import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Volta do Google. Sem convite, o banco recusa a conta e o Supabase devolve error=...
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }
  // Conta inexistente: cadastro desligado (signup_disabled) ou trigger de convite recusou.
  const codigo = searchParams.get("error_code") ?? "";
  const descricao = searchParams.get("error_description") ?? "";
  const semConvite =
    codigo === "signup_disabled" || codigo === "unexpected_failure" || /saving new user|signups not allowed/i.test(descricao);
  return NextResponse.redirect(`${origin}/login?erro=${semConvite ? "convite" : "google"}`);
}
