// Local integration harness: real Auth, PostgREST, Storage and optional OpenAI.
// The runner supplies only the isolated project's credentials in the environment.
if (Deno.env.get("SUPABASE_URL") !== "http://127.0.0.1:55321") {
  throw new Error(
    "The integration handler requires the isolated local project",
  );
}
const serve = Deno.serve;
Deno.serve = ((handler: Deno.ServeHandler) =>
  serve(
    { hostname: "127.0.0.1", port: 55330 },
    handler,
  )) as typeof Deno.serve;
await import("../supabase/functions/ai/index.ts");
