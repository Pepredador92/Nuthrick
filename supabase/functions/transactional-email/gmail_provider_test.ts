import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { encrypt } from "../agenda/security.ts";
import { GmailEmailProvider } from "./gmail-provider.ts";
import type { Message } from "./domain.ts";

const secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const message: Message = {
  from: "Nuthrick <susy.asistencia.online@gmail.com>",
  to: ["susy.asistencia.online@gmail.com"],
  reply_to: "susy.asistencia.online@gmail.com",
  subject: "Confirmación de pago · Nuthrick",
  text: "Texto de prueba",
  html: "<p>Texto de prueba</p>",
};

Deno.test("Gmail provider exchanges OAuth refresh token and sends multipart mail", async () => {
  const encrypted = await encrypt(secret, "refresh-token");
  const requests: { url: string; body?: string }[] = [];
  const provider = new GmailEmailProvider({
    senderEmail: "susy.asistencia.online@gmail.com",
    encryptedRefreshToken: encrypted,
    encryptionKey: secret,
    clientId: "client-id",
    clientSecret: "client-secret",
    http: async (input, init) => {
      requests.push({ url: String(input), body: typeof init?.body === "string" ? init.body : undefined });
      if (String(input).includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "access-token" });
      }
      return Response.json({ id: "gmail-message-id" });
    },
  });
  assertEquals(await provider.send(message, "outbox-key-123"), "gmail-message-id");
  assertEquals(requests.length, 2);
  const request = JSON.parse(requests[1].body ?? "{}");
  assertStringIncludes(request.raw, "b3V0Ym94LWtleS0xMjM");
  assertStringIncludes(requests[1].body ?? "", "raw");
});

Deno.test("Gmail provider verifies the OAuth sender identity without DNS records", async () => {
  const encrypted = await encrypt(secret, "refresh-token");
  const provider = new GmailEmailProvider({
    senderEmail: "susy.asistencia.online@gmail.com",
    encryptedRefreshToken: encrypted,
    encryptionKey: secret,
    clientId: "client-id",
    clientSecret: "client-secret",
    http: async (input) => String(input).includes("profile")
      ? Response.json({ emailAddress: "susy.asistencia.online@gmail.com" })
      : Response.json({ access_token: "access-token" }),
  });
  const evidence = await provider.inspectDomain("", "");
  assert(evidence.oauth);
  assertEquals(evidence.provider_status, "gmail_oauth");
  assertEquals(evidence.records, []);
});
