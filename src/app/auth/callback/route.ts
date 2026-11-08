import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Volta do Google. Sem convite, o banco recusa a conta e o Supabase devolve error=...
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/leads`);
  }
  const semConvite = (searchParams.get("error_description") ?? "").includes("saving new user");
  return NextResponse.redirect(`${origin}/login?erro=${semConvite ? "convite" : "google"}`);
}
