import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporte: Transporter | undefined;

// Local: Mailpit do Supabase (127.0.0.1:54325). Produção: SMTP do Resend (smtp.resend.com:465).
function smtp() {
  const porta = Number(process.env.SMTP_PORT ?? 587);
  transporte ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA } : undefined,
  });
  return transporte;
}

// Só texto: o conteúdo pode vir de mensagem digitada por alguém, sem HTML para escapar.
export async function enviarEmail(para: string, titulo: string, texto: string | null, link: string) {
  await smtp().sendMail({
    from: process.env.EMAIL_REMETENTE,
    to: para,
    subject: titulo,
    text: `${texto ? texto + "\n\n" : ""}Abrir no CRM: ${link}`,
  });
}
