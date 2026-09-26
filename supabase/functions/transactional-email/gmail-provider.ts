import {
  EmailError,
  type DomainEvidence,
  type Message,
  type TransactionalEmailProvider,
} from "./domain.ts";

const encoder = new TextEncoder();

function base64Bytes(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(text);
}

function unbase64Url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}

async function decrypt(secret: string, envelope: string): Promise<string> {
  const [version, nonce, data] = envelope.split(".");
  if (version !== "v1" || !nonce || !data) throw new Error("invalid_envelope");
  const key = await crypto.subtle.importKey(
    "raw",
    unbase64Url(secret),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64Url(nonce), additionalData: encoder.encode("agenda:v1") },
    key,
    unbase64Url(data),
  ));
}

function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") throw new Error("invalid_email");
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) {
    throw new Error("invalid_email");
  }
  return email;
}

function base64(bytes: Uint8Array): string {
  return base64Bytes(bytes);
}

function base64Url(value: string): string {
  return base64(encoder.encode(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function encodedHeader(value: string): string {
  return `=?UTF-8?B?${base64(encoder.encode(value))}?=`;
}

function headerEmail(value: string): string {
  const match = value.match(/<([^<>]+)>$/);
  return normalizeEmail(match?.[1] ?? value);
}

function gmailMessage(message: Message, key: string): string {
  const from = headerEmail(message.from);
  const to = normalizeEmail(message.to[0] ?? "");
  const replyTo = normalizeEmail(message.reply_to);
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(key)) {
    throw new EmailError("invalid_input");
  }
  const boundary = `nuthrick_${key.replaceAll(/[^A-Za-z0-9_-]/g, "")}`;
  const headers = [
    `From: Nuthrick <${from}>`,
    `To: ${to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodedHeader(message.subject)}`,
    `Message-ID: <nuthrick-${key}@nuthrick.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(encoder.encode(message.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(encoder.encode(message.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return base64Url(`${headers}\r\n\r\n${body}`);
}

type GmailProviderOptions = {
  senderEmail: string;
  encryptedRefreshToken: string;
  encryptionKey: string;
  clientId: string;
  clientSecret: string;
  http?: typeof fetch;
};

type GmailTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export class GmailEmailProvider implements TransactionalEmailProvider {
  private readonly http: typeof fetch;

  constructor(private readonly options: GmailProviderOptions) {
    this.http = options.http ?? fetch;
    normalizeEmail(options.senderEmail);
    console.log("gmail_provider_configuration", {
      has_encryption_key: Boolean(options.encryptionKey),
      has_client_id: Boolean(options.clientId),
      has_client_secret: Boolean(options.clientSecret),
      has_refresh_token: Boolean(options.encryptedRefreshToken),
    });
    if (!options.encryptedRefreshToken || !options.encryptionKey) {
      throw new EmailError("email_sender_unavailable");
    }
    if (!options.clientId || !options.clientSecret) {
      throw new EmailError("email_sender_unavailable");
    }
  }

  private async accessToken(): Promise<string> {
    let refreshToken: string;
    try {
      refreshToken = await decrypt(
        this.options.encryptionKey,
        this.options.encryptedRefreshToken,
      );
    } catch {
      console.error("gmail_provider_refresh_token_decrypt_failed");
      throw new EmailError("email_sender_unavailable");
    }
    let response: Response;
    try {
      response = await this.http("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      console.error("gmail_provider_oauth_network_failed");
      throw new EmailError("email_sender_unavailable", true);
    }
    let data: GmailTokenResponse = {};
    try {
      data = await response.json();
    } catch {
      // Keep the bounded provider error below.
    }
    if (!response.ok || typeof data.access_token !== "string") {
      console.error("gmail_provider_oauth_rejected", {
        status: response.status,
        error: data.error ?? "unknown",
      });
      if (data.error === "invalid_grant") {
        throw new EmailError("email_sender_reauthorization_required");
      }
      throw new EmailError(
        "email_sender_unavailable",
        response.status >= 500 || response.status === 429,
      );
    }
    return data.access_token;
  }

  async send(message: Message, key: string): Promise<string> {
    if (headerEmail(message.from) !== normalizeEmail(this.options.senderEmail)) {
      throw new EmailError("email_sender_mismatch");
    }
    const access = await this.accessToken();
    let response: Response;
    try {
      response = await this.http(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: gmailMessage(message, key) }),
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new EmailError("email_delivery_unknown", false);
    }
    if (response.status === 429) {
      throw new EmailError("email_provider_rate_limited", true);
    }
    if (response.status >= 500) {
      throw new EmailError("email_delivery_unknown", false);
    }
    if (!response.ok) throw new EmailError("email_provider_rejected");
    try {
      const data = await response.json();
      if (typeof data.id !== "string" || !data.id) throw new Error();
      return data.id;
    } catch {
      throw new EmailError("email_delivery_unknown", false);
    }
  }

  async inspectDomain(_id: string, _name: string): Promise<DomainEvidence> {
    const access = await this.accessToken();
    let response: Response;
    try {
      response = await this.http(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15000) },
      );
    } catch {
      console.error("gmail_provider_profile_network_failed");
      throw new EmailError("email_sender_unavailable", true);
    }
    if (!response.ok) {
      console.error("gmail_provider_profile_rejected", { status: response.status });
      throw new EmailError("email_sender_unavailable");
    }
    const profile = await response.json() as { email?: string; email_verified?: boolean };
    if (!profile.email_verified || normalizeEmail(profile.email) !== normalizeEmail(this.options.senderEmail)) {
      console.error("gmail_provider_profile_mismatch");
      throw new EmailError("email_sender_mismatch");
    }
    return {
      spf: false,
      dkim: false,
      dmarc: false,
      oauth: true,
      sender_email: normalizeEmail(profile.email),
      provider_status: "gmail_oauth",
      records: [],
      dmarc_records: [],
    };
  }
}

export { gmailMessage };
