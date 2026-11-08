import { describe, expect, test } from "vitest";
import { gerarIcs, horaSP, paraUtc, situacaoReuniao, type EventoIcs } from "./reunioes";

describe("datas", () => {
  test("hora de São Paulo vira UTC (+3h)", () => {
    expect(paraUtc("2026-11-10", "14:30")).toBe("2026-11-10T17:30:00.000Z");
    expect(paraUtc("2026-11-10", "22:00")).toBe("2026-11-11T01:00:00.000Z");
  });
  test("mostra no horário de São Paulo", () => {
    expect(horaSP("2026-11-10T17:30:00Z")).toBe("10/11 às 14:30");
  });
});

const evento: EventoIcs = {
  id: "abc",
  sequencia: 2,
  titulo: "Reunião, metas; vendas\nda loja",
  descricao: "Pauta: " + "texto longo com acentuação ".repeat(8),
  inicio: "2026-11-10T17:30:00Z",
  duracaoMin: 60,
  local: "Loja Centro",
  organizador: "avisos@crm-lojas.app",
  participantes: ["ana@loja.com", "bruno@loja.com"],
};

describe("gerarIcs", () => {
  const ics = gerarIcs([evento], "REQUEST");
  const linhas = ics.split("\r\n");

  test("estrutura de convite", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const desdobrado = ics.replace(/\r\n /g, "");
    for (const l of [
      "METHOD:REQUEST",
      "UID:abc@crm-lojas",
      "SEQUENCE:2",
      "DTSTART:20261110T173000Z",
      "DTEND:20261110T183000Z",
      "SUMMARY:Reunião\\, metas\\; vendas\\nda loja",
      "LOCATION:Loja Centro",
      "ORGANIZER;CN=CRM Lojas:mailto:avisos@crm-lojas.app",
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:ana@loja.com",
      "STATUS:CONFIRMED",
    ]) {
      expect(desdobrado).toContain(l + "\r\n");
    }
    expect(linhas.some((l) => l.startsWith("DTSTAMP:"))).toBe(true);
  });

  test("só CRLF e linhas de no máximo 75 bytes", () => {
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const l of linhas) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
  });

  test("dobra sem quebrar acento", () => {
    const desdobrado = ics.replace(/\r\n /g, "");
    expect(desdobrado).toContain("DESCRIPTION:" + evento.descricao);
  });

  test("cancelamento", () => {
    const c = gerarIcs([evento], "CANCEL");
    expect(c).toContain("METHOD:CANCEL\r\n");
    expect(c).toContain("STATUS:CANCELLED\r\n");
  });

  test("feed publica vários eventos sem organizador", () => {
    const semConvite = { ...evento, organizador: undefined, participantes: [] };
    const f = gerarIcs([semConvite, { ...semConvite, id: "def" }], "PUBLISH");
    expect(f.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(f).not.toContain("ORGANIZER");
  });
});

describe("situacaoReuniao", () => {
  const base = { inicio: "2026-11-10T17:00:00Z", duracao_min: 60, cancelada: false, aconteceu: null as boolean | null };
  const em = (iso: string) => new Date(iso);
  test("linha do tempo", () => {
    expect(situacaoReuniao(base, em("2026-11-10T16:00:00Z"))).toBe("proxima");
    expect(situacaoReuniao(base, em("2026-11-10T17:30:00Z"))).toBe("agora");
    expect(situacaoReuniao(base, em("2026-11-11T17:00:00Z"))).toBe("aguardando");
    expect(situacaoReuniao(base, em("2026-11-11T18:00:01Z"))).toBe("sem_registro");
  });
  test("registro e cancelamento mandam", () => {
    expect(situacaoReuniao({ ...base, aconteceu: true }, em("2026-11-20T00:00:00Z"))).toBe("aconteceu");
    expect(situacaoReuniao({ ...base, aconteceu: false }, em("2026-11-20T00:00:00Z"))).toBe("nao_aconteceu");
    expect(situacaoReuniao({ ...base, cancelada: true }, em("2026-11-20T00:00:00Z"))).toBe("cancelada");
  });
});
