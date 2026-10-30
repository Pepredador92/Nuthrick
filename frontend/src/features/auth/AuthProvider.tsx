'use client';

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '@/src/lib/supabase';
import { ensureOwnProfile, fetchOwnProfile } from '@/src/services/profile';
import type { ProfessionalProfile } from '@/src/types/domain';
import { rememberSimulationSession, simulationAuthKey, simulationLaunch } from '@/src/features/simulator/state';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: ProfessionalProfile | null;
  loading: boolean;
  configurationReady: boolean;
  refreshProfile: () => Promise<ProfessionalProfile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [loading, setLoading] = useState(hasSupabaseConfig);
  const currentUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const value = await ensureOwnProfile(userId);
      setProfile(value);
      return value;
    } catch {
      const value = await fetchOwnProfile(userId);
      setProfile(value);
      return value;
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return;
    }

    let active = true;
    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const simulation=simulationLaunch();
        if(data.session&&simulation&&(data.session.user.id!==simulation.run.professional_id||data.session.user.app_metadata.nuthrick_simulation!==true)){
          await supabase.auth.signOut({scope:'local'});throw new Error('simulation_session_mismatch');
        }
        if (!active) return;
        setSession(data.session);
        currentUserId.current = data.session?.user.id ?? null;
        if (data.session?.user) await loadProfile(data.session.user.id);
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const simulation=simulationLaunch();
      if(nextSession&&simulation&&(nextSession.user.id!==simulation.run.professional_id||nextSession.user.app_metadata.nuthrick_simulation!==true)){
        queueMicrotask(()=>{void supabase.auth.signOut({scope:'local'});});return;
      }
      if(nextSession&&simulation)rememberSimulationSession(nextSession);
      const nextUserId = nextSession?.user.id ?? null;
      const sameUser = Boolean(nextUserId && nextUserId === currentUserId.current);
      setSession(nextSession);
      currentUserId.current = nextUserId;
      if (nextSession?.user) {
        // Refreshing the same session must not unmount the private application.
        if (sameUser && event !== 'USER_UPDATED') return;
        if (!sameUser) setLoading(true);
        queueMicrotask(() => {
          void loadProfile(nextSession.user.id)
            .catch(() => { if (active) setProfile(null); })
            .finally(() => { if (active && !sameUser) setLoading(false); });
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return null;
    return loadProfile(session.user.id);
  }, [loadProfile, session]);

  const signOut = useCallback(async () => {
    const simulation=simulationLaunch();
    if(simulation){
      // Signing out is itself part of the walkthrough. Retain only the prepared
      // demo credentials so its Login screen can be explored again. Exit ends
      // the run and revokes this isolated session through the normal Auth API.
      supabase.auth.stopAutoRefresh();
      sessionStorage.removeItem(`${simulationAuthKey}:${simulation.run.id}`);
      setSession(null);setProfile(null);currentUserId.current=null;
      window.location.assign('/login');return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
    currentUserId.current = null;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    profile,
    loading,
    configurationReady: hasSupabaseConfig,
    refreshProfile,
    signOut,
  }), [loading, profile, refreshProfile, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  return value;
}
