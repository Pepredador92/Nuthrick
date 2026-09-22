// Only for the loopback integration runner. Deno net permission also excludes OpenAI.
const serve=Deno.serve;
Deno.serve=((handler:Deno.ServeHandler)=>serve({hostname:'127.0.0.1',port:54330},handler)) as typeof Deno.serve;
await import('../supabase/functions/ai/index.ts');
