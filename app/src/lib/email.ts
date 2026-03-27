import nodemailer from "nodemailer";

function makeTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port   = parseInt(process.env.SMTP_PORT ?? "2525");
  const secure = port === 465; // implicit TLS on 465; STARTTLS on 587/2525
  return nodemailer.createTransport({
    host:       process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure, // enforce STARTTLS on non-SSL ports (rejects plaintext fallback)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

const FROM = `${process.env.SMTP_FROM_NAME ?? "Artisans Asylum"} <${process.env.SMTP_FROM ?? "noreply@artisans-collab.org"}>`;

async function send({ to, subject, html }: { to: string; subject: string; html: string }) {
  const transport = makeTransport();
  if (!transport) {
    console.log(`[email stub] to=${to} subject=${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`Email send failed to ${to}:`, err);
  }
}

export async function sendWelcomeMail(member: { name: string; email: string }) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  await send({
    to:      member.email,
    subject: "Welcome to Artisans Asylum",
    html: `
<p>Hi ${member.name},</p>
<p>Your Artisans Asylum member account has been created.</p>
<p>Log in at: <a href="${base}/auth/signin">${base}/auth/signin</a></p>
<p>Your initial password is <strong>changeme</strong> — please update it after your first login.</p>
<p>Questions? Stop by the front desk or email <a href="mailto:info@artisans-collab.org">info@artisans-collab.org</a>.</p>
`,
  });
}
