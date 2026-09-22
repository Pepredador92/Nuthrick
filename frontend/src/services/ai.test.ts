import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAIBalance, runAIRequest } from './ai';
import { supabase } from '@/src/lib/supabase';
vi.mock('@/src/lib/supabase',()=>({supabase:{rpc:vi.fn(),functions:{invoke:vi.fn()}}}));
beforeEach(()=>vi.clearAllMocks());
it('refreshes balance even when an invalid output consumed credits',async()=>{
  vi.mocked(supabase.functions.invoke).mockResolvedValue({data:null,error:{context:{json:async()=>({error:'invalid_output'})}}} as never);
  const changed=vi.fn();window.addEventListener('nuthrick:ai-balance',changed);
  await expect(runAIRequest({feature:'core_check',idempotencyKey:'logical-key'})).rejects.toThrow('No se modificó el expediente');
  expect(changed).toHaveBeenCalledOnce();window.removeEventListener('nuthrick:ai-balance',changed);
});
it('does not expose a provider error body',async()=>{
  vi.mocked(supabase.functions.invoke).mockResolvedValue({data:null,error:{context:{json:async()=>({error:'raw-provider-private-message'})}}} as never);
  await expect(runAIRequest({feature:'core_check',idempotencyKey:'logical-key'})).rejects.toThrow('No se pudo generar. Inténtalo más tarde.');
});
it('rejects malformed balance rather than displaying an invented value',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:{available_credits:'bad',reserved_credits:0},error:null} as never);
  await expect(getAIBalance()).rejects.toThrow('No se pudo consultar');
});
it('keeps OpenAI credentials and direct calls out of frontend modules',()=>{
  for(const relative of ['./ai.ts','../components/ai/AIControls.tsx']) {
    const source=readFileSync(new URL(relative,import.meta.url),'utf8');
    expect(source).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|SUPABASE_SERVICE_ROLE_KEY/);
  }
});
