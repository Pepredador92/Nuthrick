export const SITE = "https://nuthrick.vercel.app";
export const TEMPLATE_KEYS = [
  "welcome",
  "subscription_activated",
  "payment_confirmed",
  "payment_failed",
  "grace_started",
  "account_suspended",
  "payment_recovered",
  "cancellation_scheduled",
  "subscription_cancelled",
  "renewal_upcoming",
  "beta_expiring",
  "beta_expired",
  "credits_purchased",
  "credits_refunded",
  "promotion_applied",
] as const;
export type Envelope = {
  id: string;
  recipient: string;
  template_key: string;
  subject: string;
  body: string;
  mode: "test" | "live";
  controlled_test: boolean;
  from_email: string;
  reply_to: string;
  support_email: string;
  privacy_email: string;
  first_attempt_at: string;
  attempts: number;
  prepared_message?: Message | null;
};
export type Message = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
};
export type DomainEvidence = {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  provider_status: string;
  records: Record<string, unknown>[];
  dmarc_records: string[];
};
export interface TransactionalEmailProvider {
  send(message: Message, key: string): Promise<string>;
  inspectDomain(id: string, name: string): Promise<DomainEvidence>;
}
export class EmailError extends Error {
  constructor(code: string, readonly retryable = false) {
    super(code);
  }
}
export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 &&
    /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}
export const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export function renderEmail(e: Envelope): Message {
  if (!validEmail(e.recipient) || /\.(invalid|test)$/i.test(e.recipient)) {
    throw new EmailError("invalid_recipient");
  }
  if (
    ![e.from_email, e.reply_to, e.support_email, e.privacy_email].every(
      validEmail,
    )
  ) throw new EmailError("invalid_sender");
  if (
    !(TEMPLATE_KEYS as readonly string[]).includes(e.template_key) ||
    /[\r\n]/.test(e.subject)
  ) throw new EmailError("invalid_template");
  const path = e.template_key.startsWith("credits_")
    ? "/app/credits"
    : e.template_key === "welcome"
    ? "/app"
    : "/app/my-plan";
  const url = SITE + path;
  const label = e.controlled_test
    ? "Prueba transaccional controlada. Este correo simula un evento TEST y no corresponde a un cobro real."
    : e.mode === "test"
    ? "Evento TEST. No se realizó un cobro real."
    : "";
  const subject = (e.mode === "test" ? "[TEST] " : "") + e.subject;
  const footer =
    `Soporte: ${e.support_email}\nPrivacidad: ${e.privacy_email}\nTérminos: ${SITE}/terms\nPrivacidad: ${SITE}/privacy\nReembolsos: ${SITE}/refunds`;
  const text = ["Nuthrick", label, e.body, `Abrir Nuthrick: ${url}`, footer]
    .filter(Boolean).join("\n\n");
  const html =
    `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7f4;color:#203b32;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="padding:24px 12px"><table role="presentation" style="max-width:600px;width:100%;margin:auto;background:white;border-radius:18px"><tr><td style="padding:32px"><div style="font-size:24px;font-weight:700">Nuthrick</div>${
      label
        ? `<p style="padding:12px;background:#eef3ed;font-size:14px">${
          escapeHtml(label)
        }</p>`
        : ""
    }<h1 style="font-size:23px;line-height:1.35">${
      escapeHtml(e.subject)
    }</h1><p style="line-height:1.7;white-space:pre-line">${
      escapeHtml(e.body)
    }</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:#23684e;color:white;text-decoration:none">Abrir Nuthrick</a></p><hr style="border:0;border-top:1px solid #dde5df"><p style="font-size:13px;line-height:1.7">Soporte: <a href="mailto:${
      escapeHtml(e.support_email)
    }">${escapeHtml(e.support_email)}</a><br>Privacidad: <a href="mailto:${
      escapeHtml(e.privacy_email)
    }">${
      escapeHtml(e.privacy_email)
    }</a></p><p style="font-size:12px;line-height:1.7"><a href="${SITE}/terms">Términos</a> · <a href="${SITE}/privacy">Privacidad</a> · <a href="${SITE}/refunds">Reembolsos</a></p></td></tr></table></td></tr></table></body></html>`;
  return {
    from: `Nuthrick <${e.from_email}>`,
    to: [e.recipient],
    reply_to: e.reply_to,
    subject,
    html,
    text,
  };
}
