import { redirect } from "next/navigation";
import { obterSessao, podeGerir } from "@/lib/sessao";

// Dona/gerente começam pelo painel; os outros pelos leads.
export default async function Inicio() {
  const { lojas } = await obterSessao();
  redirect(lojas.some((l) => podeGerir(l.cargo)) ? "/painel" : "/leads");
}
