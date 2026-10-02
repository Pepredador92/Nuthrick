import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAIBalance, runAIRequest } from './ai';
import { supabase } from '@/src/lib/supabase';
vi.mock('@/src/lib/supabase',()=>({supabase:{rpc:vi.fn(),functions:{invoke:vi.fn()}}}));
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockResolvedValue({data:{eligible:false,accepted:false,version:'test'},error:null} as never);
});
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
it('opens the consent notice and blocks the request before invoking AI',async()=>{
  vi.mocked(supabase.rpc).mockResolvedValue({data:{eligible:true,accepted:false,version:'pilot-v1'},error:null} as never);
  const prompt=vi.fn();window.addEventListener('nuthrick:ai-consent-manage',prompt);
  await expect(runAIRequest({feature:'recall_24h',idempotencyKey:'logical-key'})).rejects.toThrow('revisa y acepta el aviso');
  expect(prompt).toHaveBeenCalledOnce();expect(supabase.functions.invoke).not.toHaveBeenCalled();
  window.removeEventListener('nuthrick:ai-consent-manage',prompt);
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
it.each(['input_too_large','input_count_unavailable'])('explains %s and keeps the manual completion path clear', async code => {
  vi.mocked(supabase.functions.invoke).mockResolvedValue({data:null,error:{context:{json:async()=>({error:code})}}} as never);
  await expect(runAIRequest({feature:'pes_diagnosis',idempotencyKey:'key'})).rejects.toThrow(/manualmente/);
});
