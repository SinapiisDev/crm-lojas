import Link from "next/link";

export default function LeadNaoEncontrado() {
  return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <p className="font-medium">Lead não encontrado</p>
      <Link href="/leads" className="text-sm underline">
        Voltar para os leads
      </Link>
    </div>
  );
}
