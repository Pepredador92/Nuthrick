import { createClient } from '@supabase/supabase-js';
import { isSimulation, simulationAuthKey, simulationLaunch } from '@/src/features/simulator/state';

const suppliedUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const suppliedKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const simulation = isSimulation();

export const hasSupabaseConfig = Boolean(suppliedUrl && suppliedKey);

// Valid placeholders keep the public landing buildable before a project is linked.
// Product routes surface a clear configuration message instead of sending secrets.
export const supabase = createClient(
  suppliedUrl ?? 'https://placeholder.supabase.co',
  suppliedKey ?? 'sb_publishable_placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(simulation ? {storageKey:`${simulationAuthKey}:${simulationLaunch()!.run.id}`,storage:window.sessionStorage,detectSessionInUrl:false} : {}),
    },
  },
);
