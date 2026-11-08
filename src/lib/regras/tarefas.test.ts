import { describe, expect, test } from "vitest";
import { diasEntre, hojeSP, mensagemCobranca, situacaoPrazo, textoPrazo } from "./tarefas";

const HOJE = "2026-11-10";

describe("hojeSP", () => {
  test("às 23h30 em São Paulo ainda é o mesmo dia (02h30 UTC do dia seguinte)", () => {
    expect(hojeSP(new Date("2026-11-11T02:30:00Z"))).toBe("2026-11-10");
  });
});

describe("diasEntre", () => {
  test("conta dias de calendário", () => {
    expect(diasEntre("2026-11-07", HOJE)).toBe(3);
    expect(diasEntre(HOJE, "2026-12-01")).toBe(21);
  });
});

describe("situacaoPrazo", () => {
  test("classifica pelo dia de hoje", () => {
    expect(situacaoPrazo("2026-11-09", "a_fazer", HOJE)).toBe("atrasada");
    expect(situacaoPrazo(HOJE, "fazendo", HOJE)).toBe("hoje");
    expect(situacaoPrazo("2026-11-11", "a_fazer", HOJE)).toBe("amanha");
    expect(situacaoPrazo("2026-11-15", "a_fazer", HOJE)).toBe("ok");
    expect(situacaoPrazo("2026-11-01", "feito", HOJE)).toBe("feita");
  });
});

describe("textoPrazo", () => {
  test("textos para cada situação", () => {
    expect(textoPrazo("2026-11-07", "a_fazer", HOJE)).toBe("atrasada há 3 dias");
    expect(textoPrazo("2026-11-09", "a_fazer", HOJE)).toBe("atrasada há 1 dia");
    expect(textoPrazo(HOJE, "a_fazer", HOJE)).toBe("vence hoje");
    expect(textoPrazo("2026-11-11", "a_fazer", HOJE)).toBe("vence amanhã");
    expect(textoPrazo("2026-11-14", "a_fazer", HOJE)).toBe("vence 14/11");
    expect(textoPrazo("2026-11-07", "feito", HOJE)).toBe("feita");
  });
});

describe("mensagemCobranca", () => {
  test("atrasada", () => {
    expect(mensagemCobranca("Bruno Lima", "Orçamento Sr. Paulo", "2026-11-07", HOJE)).toBe(
      'Oi Bruno, a tarefa "Orçamento Sr. Paulo" venceu há 3 dias. Me dá um retorno até hoje?',
    );
  });
  test("vence hoje", () => {
    expect(mensagemCobranca("Ana", "Vitrine", HOJE, HOJE)).toBe(
      'Oi Ana, a tarefa "Vitrine" vence hoje. Me dá um retorno até hoje?',
    );
  });
  test("ainda no prazo", () => {
    expect(mensagemCobranca("Ana", "Vitrine", "2026-11-14", HOJE)).toBe(
      'Oi Ana, a tarefa "Vitrine" vence em 14/11. Me dá um retorno até hoje?',
    );
  });
});
