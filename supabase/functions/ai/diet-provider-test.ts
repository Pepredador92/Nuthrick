import { AIError, type AIProvider, type ProviderInput } from './core.ts';

/** Test adapter, not a fallback. Never has a network client or an API key. */
export function localDietTestMode(url: string, flag: string | undefined) {
  try { return flag === 'true' && ['127.0.0.1','localhost','kong'].includes(new URL(url).hostname); }
  catch { return false; }
}
export class SimulatedDietProvider implements AIProvider {
  async run(input: ProviderInput) {
    if (input.config.feature !== 'diet_draft' || input.config.execution_mode !== 'simulated') throw new AIError('feature_disabled');
    if (input.config.model === 'simulated-error') throw new AIError('provider_rejected');
    const payload = input.context as {meals:Array<{meal_ref:string;distribution:Array<{group_code:string;portions:number}>;candidates:Array<{candidate_ref:string;type:string;exchanges:Array<{group_code:string;portions:number}>}>}>};
    const output = {schema_version:1,meal_options:payload.meals.map(m=>({meal_ref:m.meal_ref,entries:m.distribution.map(g=>{
      const c=m.candidates.find(c=>c.type==='food'&&c.exchanges.length===1&&c.exchanges[0].group_code===g.group_code);
      if(!c)throw new AIError('proposal_unavailable');
      return {candidate_ref:c.candidate_ref,portion_ref:'base',multiplier:g.portions/c.exchanges[0].portions};
    })}))};
    if(input.config.model==='simulated-invalid')output.meal_options[0].entries[0].candidate_ref='unauthorized';
    if(input.config.model==='simulated-adjustment')output.meal_options[0].entries[0].multiplier=0.5;
    return {status:'completed',output,usage:{input_tokens:0,output_tokens:0,cached_tokens:0},responseId:`simulated:${input.generationId}`,model:input.config.model,latencyMs:0};
  }
}
