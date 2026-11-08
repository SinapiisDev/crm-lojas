export type SituacaoReuniao = "proxima" | "agora" | "aguardando" | "sem_registro" | "aconteceu" | "nao_aconteceu" | "cancelada";

export type EventoIcs = {
  id: string;
  sequencia: number;
  titulo: string;
  descricao?: string | null;
  inicio: string; // ISO UTC
  duracaoMin: number;
  local?: string | null;
  organizador?: string; // e-mail
  participantes: string[]; // e-mails
};

// shortcut: São Paulo fixo em UTC-3 (sem horário de verão desde 2019); se voltar, trocar por Intl.
export function paraUtc(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00-03:00`).toISOString();
}

const formatoSP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function horaSP(iso: string): string {
  const p = Object.fromEntries(formatoSP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

const HORA = 3_600_000;

export function situacaoReuniao(
  r: { inicio: string; duracao_min: number; cancelada: boolean; aconteceu: boolean | null },
  agora = new Date(),
): SituacaoReuniao {
  if (r.cancelada) return "cancelada";
  if (r.aconteceu !== null) return r.aconteceu ? "aconteceu" : "nao_aconteceu";
  const inicio = Date.parse(r.inicio);
  const fim = inicio + r.duracao_min * 60_000;
  const t = agora.getTime();
  if (t < inicio) return "proxima";
  if (t < fim) return "agora";
  return t <= fim + 24 * HORA ? "aguardando" : "sem_registro";
}

// ---------- iCalendar (RFC 5545) ----------

const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const dataIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Dobra em 75 bytes sem cortar caractere UTF-8; continuação começa com espaço (que conta no limite).
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const c of linha) {
    const b = Buffer.byteLength(c, "utf8");
    const limite = partes.length ? 74 : 75;
    if (bytes + b > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += c;
    bytes += b;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export function gerarIcs(eventos: EventoIcs[], metodo: "REQUEST" | "CANCEL" | "PUBLISH"): string {
  const agora = dataIcs(new Date());
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CRM Lojas//Reunioes//PT-BR", "CALSCALE:GREGORIAN", `METHOD:${metodo}`];
  for (const e of eventos) {
    const inicio = new Date(e.inicio);
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@crm-lojas`,
      `SEQUENCE:${e.sequencia}`,
      `DTSTAMP:${agora}`,
      `DTSTART:${dataIcs(inicio)}`,
      `DTEND:${dataIcs(new Date(inicio.getTime() + e.duracaoMin * 60_000))}`,
      `SUMMARY:${escapar(e.titulo)}`,
    );
    if (e.descricao) linhas.push(`DESCRIPTION:${escapar(e.descricao)}`);
    if (e.local) linhas.push(`LOCATION:${escapar(e.local)}`);
    if (e.organizador) linhas.push(`ORGANIZER;CN=CRM Lojas:mailto:${e.organizador}`);
    for (const p of e.participantes) linhas.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${p}`);
    linhas.push(`STATUS:${metodo === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
