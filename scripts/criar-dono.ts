// Uso: npm run criar-dono -- email@exemplo.com "Nome da Pessoa"
// Convida a pessoa como dona de TODAS as lojas cadastradas.
import { createClient } from "@supabase/supabase-js";

const [email, nome] = process.argv.slice(2);
if (!email || !nome) {
  console.error('Uso: npm run criar-dono -- email@exemplo.com "Nome"');
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const { data: lojas, error } = await admin.from("lojas").select("id, nome");
if (error || !lojas?.length) throw error ?? new Error("Nenhuma loja cadastrada");

const { data: convites, error: erroConvite } = await admin
  .from("convites")
  .insert(lojas.map((l) => ({ email, loja_id: l.id, cargo: "dono" })))
  .select("aceito_em");
if (erroConvite) throw erroConvite;

if (convites.every((c) => c.aceito_em)) {
  console.log(`${email} já tinha conta: agora é dono(a) de ${lojas.map((l) => l.nome).join(", ")}.`);
} else {
  const { error: erroInvite } = await admin.auth.admin.inviteUserByEmail(email, { data: { nome } });
  if (erroInvite) throw erroInvite;
  console.log(`Convite enviado para ${email}. Local: veja o e-mail em http://127.0.0.1:54324`);
}
