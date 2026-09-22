import { AIError, type AIProvider, type FeatureConfig, type ProviderInput, type ProviderResult } from './core.ts';
import { redactClinicalText } from './clinical.ts';
import { dietDraftAdapter } from './diet-contract.ts';
import { prepareDietGeneration, manualGenerationPolicy, hasDietMenuContent, validateDietSnapshotDraft } from './diet-generation-domain.js';

// JSON crosses a service-only RPC; schema/eligibility is enforced by the shared
// runtime boundary. Types here deliberately derive from that generated bundle.
type Input = Parameters<typeof prepareDietGeneration>[0];
type Prepared = NonNullable<ReturnType<typeof prepareDietGeneration>['prepared']>;
export type DietSource = { source: Input['source']; identifiers: Array<string | null> };
export type DietSnapshot = {
  version: 1; hash: string; sourceStamp: string; hasManualMenu: boolean;
  prepared: Prepared;
  plan: Parameters<typeof validateDietSnapshotDraft>[2];
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function dietHash(value: unknown) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const v of Object.values(value)) freeze(v); }
  return value;
}
export async function prepareDietSnapshot(loaded: DietSource): Promise<DietSnapshot> {
  const identifiers = loaded.identifiers.filter((v): v is string=>typeof v === 'string' && !!v);
  const input: Input = { source: loaded.source, policy: manualGenerationPolicy(), sanitizeText: (s: string)=>redactClinicalText(s,identifiers) };
  const result = prepareDietGeneration(input,{enabled:true,budgetAvailable:true,pending:false});
  if (!result.prepared) throw new AIError(result.issues[0]?.code ?? 'context_unavailable');
  const prepared = structuredClone(result.prepared);
  // Never persist the Phase 2 raw-source fingerprint or the complete catalog.
  prepared.manifest.fingerprint = await dietHash(prepared.manifest.fingerprint);
  const plan = loaded.source.plan;
  const snapshot = JSON.parse(JSON.stringify({version:1,sourceStamp:loaded.source.stamp,
    hasManualMenu:hasDietMenuContent(plan.diet_menu),prepared,
    plan:{meal_distribution:plan.meal_distribution,exchange_prescription:plan.exchange_prescription,
      diet_menu:plan.diet_menu ? {food_preferences:plan.diet_menu.food_preferences} : null}}));
  return freeze({...snapshot,hash:await dietHash(snapshot)});
}
export async function verifyDietSnapshot(snapshot: DietSnapshot) {
  const {hash,...content} = snapshot;
  if (snapshot.version!==1 || await dietHash(content)!==hash) throw new AIError('snapshot_invalid');
  return freeze(snapshot);
}
export function validateSnapshot(output: unknown, snapshot: DietSnapshot) {
  return validateDietSnapshotDraft(output,snapshot.prepared,snapshot.plan);
}

/** Implements the Phase 2 DietGenerator contract while leaving credits entirely
 * to runAIRequest. No SDK or network dependency reaches the domain bundle. */
export class OpenAIDietGenerator {
  result?: ProviderResult;
  constructor(private provider: AIProvider, private config: FeatureConfig) {}
  async generate(request: {feature:'diet_workshop';idempotencyKey:string;generationId:string;payload:Prepared['payload']}) {
    this.result = await this.provider.run({config:this.config,...dietDraftAdapter,context:request.payload,generationId:request.generationId});
    return this.result.output;
  }
}
/** Route the existing provider through the domain adapter without introducing a
 * second reservation or a second provider call. */
export class DietRoutingProvider implements AIProvider {
  constructor(private provider: AIProvider) {}
  async run(input: ProviderInput) {
    if (input.config.feature!=='diet_draft') return this.provider.run(input);
    const generator = new OpenAIDietGenerator(this.provider,input.config);
    await generator.generate({feature:'diet_workshop',idempotencyKey:input.generationId,generationId:input.generationId,payload:input.context as Prepared['payload']});
    return generator.result!;
  }
}
export function parseDietDecision(value: Record<string,unknown>) {
  if (Object.keys(value).some(k=>!['action','generationId','replaceExisting','acceptDifferences'].includes(k))
    || !['apply_diet_draft','discard_diet_draft'].includes(String(value.action))
    || typeof value.generationId!=='string' || !/^[a-f0-9-]{36}$/i.test(value.generationId)
    || ['replaceExisting','acceptDifferences'].some(k=>value[k]!==undefined && typeof value[k]!=='boolean')) throw new AIError('invalid_request');
  return {generationId:value.generationId,replaceExisting:value.replaceExisting===true,acceptDifferences:value.acceptDifferences===true};
}
