const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export const formatarMoeda = (v: number | string | null | undefined) => (v == null ? "" : moeda.format(Number(v)));
export const formatarDataHora = (iso: string) => dataHora.format(new Date(iso));

export function textoSemContato(dias: number) {
  if (dias <= 0) return "contato hoje";
  return dias === 1 ? "há 1 dia sem contato" : `há ${dias} dias sem contato`;
}

// "42999143583" -> "(42) 99914-3583". Formato desconhecido volta como veio.
export function formatarTelefone(t: string) {
  const d = t.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
