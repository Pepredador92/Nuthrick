import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
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
    http: async (input) => String(input).includes("userinfo")
      ? Response.json({ email: "susy.asistencia.online@gmail.com", email_verified: true })
      : Response.json({ access_token: "access-token" }),
  });
  const evidence = await provider.inspectDomain("", "");
  assert(evidence.oauth);
  assertEquals(evidence.provider_status, "gmail_oauth");
  assertEquals(evidence.records, []);
  assertEquals(evidence.sender_email, "susy.asistencia.online@gmail.com");
});

Deno.test("Gmail rejects a previous OAuth identity and mismatched message From", async () => {
  let requests=0;
  const provider=new GmailEmailProvider({senderEmail:"hola.nuthrick@gmail.com",encryptedRefreshToken:await encrypt(secret,"old-refresh"),encryptionKey:secret,clientId:"client-id",clientSecret:"client-secret",http:async input=>{
    requests++;
    return String(input).includes("userinfo")?Response.json({email:"susy.asistencia.online@gmail.com",email_verified:true}):Response.json({access_token:"access-token"});
  }});
  await assertRejects(()=>provider.send(message,"outbox-key-123"),Error,"email_sender_mismatch");
  assertEquals(requests,0);
  await assertRejects(()=>provider.inspectDomain("",""),Error,"email_sender_mismatch");
});

Deno.test("Gmail ambiguous send failures require reconciliation rather than automatic retries", async () => {
  for(const outcome of ["network","server","invalid_response"]) {
    const provider=new GmailEmailProvider({senderEmail:"susy.asistencia.online@gmail.com",encryptedRefreshToken:await encrypt(secret,"refresh"),encryptionKey:secret,clientId:"client-id",clientSecret:"client-secret",http:async input=>{
      if(String(input).includes("oauth2.googleapis.com/token")) return Response.json({access_token:"access-token"});
      if(outcome==="network") throw new TypeError("network error");
      return outcome==="server"?new Response("error",{status:500}):Response.json({});
    }});
    const error=await assertRejects(()=>provider.send(message,"outbox-key-123"),Error,"email_delivery_unknown");
    assertEquals((error as {retryable?:boolean}).retryable,false);
  }
});
