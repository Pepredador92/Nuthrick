'use client';

import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from '@/src/lib/supabase';
import { ensureOwnProfile, fetchOwnProfile } from '@/src/services/profile';
import type { ProfessionalProfile } from '@/src/types/domain';

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
        if (!active) return;
        setSession(data.session);
        if (data.session?.user) await loadProfile(data.session.user.id);
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        setLoading(true);
        queueMicrotask(() => {
          void loadProfile(nextSession.user.id)
            .catch(() => { if (active) setProfile(null); })
            .finally(() => { if (active) setLoading(false); });
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
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
