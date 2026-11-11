import { Marca } from "./marca";
import { FormularioLogin } from "./formulario";

const ERROS: Record<string, string> = {
  convite: "Acesso só por convite. Fale com a gerente da sua loja.",
  "sem-loja": "Sua conta não está ligada a nenhuma loja. Fale com a dona.",
  link: "O link expirou ou já foi usado. Peça um novo convite ou use “Esqueci a senha”.",
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-svh flex-col md:flex-row">
      <Marca />
      <div className="flex flex-1 items-start justify-center p-4 md:items-center md:p-8">
        <FormularioLogin erroInicial={erro ? ERROS[erro] : undefined} />
      </div>
    </main>
  );
}
