import {
  type DomainEvidence,
  EmailError,
  type Message,
  type TransactionalEmailProvider,
} from "./domain.ts";
export class ResendEmailProvider implements TransactionalEmailProvider {
  constructor(private key: string, private http: typeof fetch = fetch) {
    if (!key.startsWith("re_")) {
      throw new EmailError("email_configuration_required");
    }
  }
  async send(message: Message, key: string): Promise<string> {
    let response: Response;
    try {
      response = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.key}`,
          "content-type": "application/json",
          "Idempotency-Key": `nuthrick-email/${key}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new EmailError("email_delivery_unknown", true);
    }
    if (response.status === 429) {
      throw new EmailError("email_rate_limited", true);
    }
    if (response.status >= 500) {
      throw new EmailError("email_delivery_unknown", true);
    }
    if (!response.ok) throw new EmailError("email_provider_rejected");
    try {
      const data = await response.json();
      if (typeof data.id !== "string" || !data.id) throw new Error();
      return data.id;
    } catch {
      throw new EmailError("email_delivery_unknown", true);
    }
  }
  async inspectDomain(id: string, name: string): Promise<DomainEvidence> {
    if (
      !/^[a-f0-9-]{36}$/.test(id) ||
      !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(name)
    ) throw new EmailError("invalid_domain");
    const response = await this.http(`https://api.resend.com/domains/${id}`, {
      headers: { authorization: `Bearer ${this.key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new EmailError("email_domain_unavailable");
    const domain = await response.json();
    if (domain.id !== id || domain.name !== name) {
      throw new EmailError("email_domain_mismatch");
    }
    const records = (Array.isArray(domain.records) ? domain.records : []).map((
      r: Record<string, unknown>,
    ) => ({
      record: r.record,
      name: r.name,
      type: r.type,
      value: r.value,
      status: r.status,
      priority: r.priority,
      ttl: r.ttl,
    }));
    const verified = (kind: string) =>
      records.some((r: Record<string, unknown>) => r.record === kind) &&
      records.filter((r: Record<string, unknown>) => r.record === kind).every((
        r: Record<string, unknown>,
      ) => r.status === "verified");
    let dmarcRecords: string[] = [];
    try {
      const dns = await this.http(
        `https://cloudflare-dns.com/dns-query?name=${
          encodeURIComponent("_dmarc." + name)
        }&type=TXT`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (dns.ok) {
        const data = await dns.json();
        dmarcRecords = (data.Answer ?? []).filter((a: { type: number }) =>
          a.type === 16
        ).map((a: { data: string }) => a.data.replaceAll('"', ""));
      }
    } catch { /* Missing DNS evidence stays pending. */ }
    return {
      spf: domain.status === "verified" && verified("SPF"),
      dkim: domain.status === "verified" && verified("DKIM"),
      dmarc:
        dmarcRecords.filter((v) =>
          /^v=DMARC1;.*\bp=(none|quarantine|reject)(;|$)/i.test(v)
        ).length === 1,
      provider_status: String(domain.status),
      records,
      dmarc_records: dmarcRecords,
    };
  }
}
