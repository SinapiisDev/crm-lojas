// Cadastro de empresa nova: vira dona só da própria loja e não enxerga as outras. Exige `npm run db:start`.
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { criarEmpresa, validarCadastro, type DadosCadastro } from "@/lib/cadastro";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const sufixo = "c" + Date.now().toString(36);
const dados = (extra: Partial<DadosCadastro> = {}): DadosCadastro => ({
  nome: "Maria",
  empresa: `Empresa ${sufixo}`,
  loja: `Loja ${sufixo}`,
  email: `dona-${sufixo}@teste.local`,
  senha: "senha-de-teste-123",
  confirmar: "senha-de-teste-123",
  ...extra,
});

describe("validarCadastro", () => {
  test("aceita dados completos e recusa faltando nome, e-mail ruim, senha curta ou diferente", () => {
    expect(validarCadastro(dados())).toBeNull();
    expect(validarCadastro(dados({ empresa: "" }))).toMatch(/Preencha/);
    expect(validarCadastro(dados({ email: "maria" }))).toMatch(/E-mail/);
    expect(validarCadastro(dados({ senha: "123", confirmar: "123" }))).toMatch(/8 caracteres/);
    expect(validarCadastro(dados({ confirmar: "outra-senha-123" }))).toMatch(/iguais/);
  });
});

describe("criarEmpresa", () => {
  test("cria empresa, loja e conta de dona que só vê a própria loja", async () => {
    const r = await criarEmpresa(admin, dados());
    expect(r).toHaveProperty("usuarioId");

    const dona = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { error } = await dona.auth.signInWithPassword({ email: dados().email, password: dados().senha });
    expect(error).toBeNull();
    const { data: lojas } = await dona.from("lojas").select("nome");
    expect(lojas?.map((l) => l.nome)).toEqual([`Loja ${sufixo}`]);
    const { data: membro } = await dona.from("membros").select("cargo").eq("usuario_id", "usuarioId" in r ? r.usuarioId : "");
    expect(membro?.map((m) => m.cargo)).toEqual(["dono"]);
  });

  test("e-mail que já tem conta é recusado sem deixar empresa sobrando", async () => {
    const r = await criarEmpresa(admin, dados({ empresa: `Repetida ${sufixo}` }));
    expect(r).toEqual({ erro: expect.stringMatching(/já tem conta/) });
    const { data } = await admin.from("empresas").select("id").eq("nome", `Repetida ${sufixo}`);
    expect(data).toEqual([]);
  });
});
