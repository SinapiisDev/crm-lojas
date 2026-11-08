import { Marca } from "./marca";
import { FormularioLogin } from "./formulario";

const ERROS: Record<string, string> = {
  convite: "Acesso só por convite. Fale com a gerente da sua loja.",
  google: "Não foi possível entrar com Google. Tente de novo ou use e-mail e senha.",
  link: "O link expirou ou já foi usado. Peça um novo convite ou use “Esqueci a senha”.",
};

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-svh flex-col bg-muted md:flex-row">
      <Marca />
      <div className="flex flex-1 items-start justify-center p-4 md:items-center md:p-8">
        <FormularioLogin erroInicial={erro ? ERROS[erro] : undefined} />
      </div>
    </main>
  );
}
