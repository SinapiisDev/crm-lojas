import { expect, test } from "vitest";
import { formatarTelefone } from "./formatar";

test("formatarTelefone: celular, fixo e formato desconhecido", () => {
  expect(formatarTelefone("42999143583")).toBe("(42) 99914-3583");
  expect(formatarTelefone("(42)3036-1683")).toBe("(42) 3036-1683");
  expect(formatarTelefone("+1 555 0100")).toBe("+1 555 0100");
});
