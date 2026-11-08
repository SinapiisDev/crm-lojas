import Link from "next/link";

export default function ReuniaoNaoEncontrada() {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <p className="font-medium">Reunião não encontrada</p>
      <Link href="/tarefas" className="text-sm underline">
        Voltar para as tarefas
      </Link>
    </div>
  );
}
