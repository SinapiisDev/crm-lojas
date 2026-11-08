// Despacho de avisos: push (servidor de push falso local) ou e-mail (Mailpit). Exige `npm run db:start`.
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { despacharAvisos } from "@/lib/avisos/despachar";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const sufixo = "d" + Date.now().toString(36);
let loja = "";
let servidor: Server;
let base = "";
const recebidos: string[] = [];

async function pessoa(nome: string) {
  const email = `${nome}-${sufixo}@teste.local`;
  await admin.from("convites").insert({ email, loja_id: loja, cargo: "vendedor" });
  const { data, error } = await admin.auth.admin.createUser({ email, password: "senha-de-teste-123", email_confirm: true });
  if (error) throw error;
  return { id: data.user!.id, email };
}

async function inscrever(usuario_id: string, caminho: string) {
  const chave = createECDH("prime256v1");
  chave.generateKeys();
  const { error } = await admin.from("push_inscricoes").insert({
    usuario_id,
    endpoint: `${base}${caminho}`,
    p256dh: chave.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  });
  if (error) throw error;
}

async function aviso(usuario_id: string, titulo: string) {
  const { data, error } = await admin
    .from("notificacoes")
    .insert({ usuario_id, loja_id: loja, titulo, texto: "detalhe", link: "/tarefas" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const pendente = async (id: string) =>
  (await admin.from("notificacoes").select("enviado_em").eq("id", id).single()).data?.enviado_em === null;

async function emailsPara(email: string) {
  const r = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  return ((await r.json()).messages ?? []) as { Subject: string }[];
}

async function esperarEmail(email: string, assunto: string) {
  for (let i = 0; i < 30; i++) {
    if ((await emailsPara(email)).some((m) => m.Subject === assunto)) return true;
    await new Promise((ok) => setTimeout(ok, 300));
  }
  return false;
}

beforeAll(async () => {
  const { data } = await admin
    .from("lojas")
    .insert({ empresa_id: "00000000-0000-0000-0000-000000000001", nome: `Despacho ${sufixo}` })
    .select("id")
    .single();
  loja = data!.id;
  // Push sempre vai por HTTPS: certificado descartável, aceito só neste processo de teste.
  const dir = mkdtempSync(path.join(tmpdir(), "push-falso-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-keyout", path.join(dir, "chave.pem"), "-out", path.join(dir, "cert.pem")], { stdio: "ignore" });
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const tls = { key: readFileSync(path.join(dir, "chave.pem")), cert: readFileSync(path.join(dir, "cert.pem")) };
  servidor = createServer(tls, (req, res) => {
    req.resume();
    recebidos.push(req.url ?? "");
    res.writeHead(req.url?.startsWith("/expirado") ? 410 : 201).end();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `https://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => servidor?.close());

describe("despacharAvisos", () => {
  test("sem inscrição vai por e-mail", async () => {
    const u = await pessoa("semPush");
    await aviso(u.id, `Email ${sufixo}`);
    await despacharAvisos();
    expect(await esperarEmail(u.email, `Email ${sufixo}`)).toBe(true);
  });

  test("com inscrição vai por push e não por e-mail", async () => {
    const u = await pessoa("comPush");
    await inscrever(u.id, `/ok/${u.id}`);
    await aviso(u.id, `Push ${sufixo}`);
    await despacharAvisos();
    await expect.poll(() => recebidos.filter((r) => r === `/ok/${u.id}`).length).toBe(1);
    await new Promise((ok) => setTimeout(ok, 800));
    expect(await emailsPara(u.email)).toEqual([]);
  });

  test("push 410 apaga inscrição e cai no e-mail", async () => {
    const u = await pessoa("expirado");
    await inscrever(u.id, `/expirado/${u.id}`);
    await aviso(u.id, `Expirado ${sufixo}`);
    await despacharAvisos();
    expect(await esperarEmail(u.email, `Expirado ${sufixo}`)).toBe(true);
    const { data } = await admin.from("push_inscricoes").select("id").eq("usuario_id", u.id);
    expect(data).toEqual([]);
  });

  test("segundo despacho não reenvia", async () => {
    const u = await pessoa("umaVez");
    await inscrever(u.id, `/ok/${u.id}`);
    await aviso(u.id, `Uma vez ${sufixo}`);
    await despacharAvisos();
    await expect.poll(() => recebidos.filter((r) => r === `/ok/${u.id}`).length).toBe(1);
    await despacharAvisos();
    await new Promise((ok) => setTimeout(ok, 800));
    expect(recebidos.filter((r) => r === `/ok/${u.id}`).length).toBe(1);
  });

  test("sem configuração não reserva nada (C1a)", async () => {
    const u = await pessoa("semConfig");
    const id = await aviso(u.id, `SemConfig ${sufixo}`);
    const salvo = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    try {
      await expect(despacharAvisos()).rejects.toThrow(/VAPID_PRIVATE_KEY/);
    } finally {
      process.env.VAPID_PRIVATE_KEY = salvo;
    }
    expect(await pendente(id)).toBe(true);
  });

  test("e-mail que falha volta para a fila (C1b)", async () => {
    const u = await pessoa("smtpFora");
    const id = await aviso(u.id, `SmtpFora ${sufixo}`);
    const salvo = process.env.SMTP_PORT;
    process.env.SMTP_PORT = "1";
    try {
      await despacharAvisos();
    } finally {
      process.env.SMTP_PORT = salvo;
    }
    expect(await pendente(id)).toBe(true);
  });

  test("prazo estourado devolve o aviso para a fila (publicação)", async () => {
    const u = await pessoa("semTempo");
    const id = await aviso(u.id, `SemTempo ${sufixo}`);
    await despacharAvisos({ prazo: Date.now() - 1 });
    expect(await pendente(id)).toBe(true);
    expect(await emailsPara(u.email)).toEqual([]);
  });

  test("TEMPO_MAX_MS vazio ou inválido usa o padrão de 25 s (C1/I5)", async () => {
    const { tempoMaximo } = await import("@/lib/avisos/despachar");
    const salvo = process.env.TEMPO_MAX_MS;
    try {
      delete process.env.TEMPO_MAX_MS;
      expect(tempoMaximo()).toBe(25_000);
      for (const ruim of ["", "8s", "0", "-5"]) {
        process.env.TEMPO_MAX_MS = ruim;
        expect(tempoMaximo()).toBe(25_000);
      }
      process.env.TEMPO_MAX_MS = "40000";
      expect(tempoMaximo()).toBe(40_000);
    } finally {
      if (salvo === undefined) delete process.env.TEMPO_MAX_MS; else process.env.TEMPO_MAX_MS = salvo;
    }
  });

  test("prazo curto (3 s) ainda envia: a margem não engole o prazo todo", async () => {
    const u = await pessoa("prazoCurto");
    const id = await aviso(u.id, `PrazoCurto ${sufixo}`);
    await despacharAvisos({ prazo: Date.now() + 3_000 });
    expect(await pendente(id)).toBe(false);
  });
});
