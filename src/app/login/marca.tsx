// Lado esquerdo do login (no celular vira só um cabeçalho). Marca provisória.
export function Marca() {
  return (
    <div className="m-3 flex flex-col items-center justify-center gap-3 rounded-3xl bg-primary p-8 text-center text-primary-foreground md:m-5 md:flex-1">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground text-2xl font-bold text-primary shadow-card">
        C
      </div>
      <p className="text-2xl font-semibold tracking-tight">Nome da empresa</p>
      <p className="max-w-xs text-sm italic opacity-80">“Cada lead, cada tarefa, no lugar certo.”</p>
    </div>
  );
}
