import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { loadProfileWorkspace } from '@/src/services/profile';
import type { ProfileWorkspace } from '@/src/types/domain';

export function useProfileWorkspace() {
  const { user, refreshProfile } = useAuth();
  const [workspace, setWorkspace] = useState<ProfileWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const value = await loadProfileWorkspace(user.id);
      setWorkspace(value);
      await refreshProfile();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible cargar tu perfil.');
    } finally { setLoading(false); }
  }, [refreshProfile, user]);

  useEffect(() => { queueMicrotask(() => void reload()); }, [reload]);
  return { workspace, loading, error, reload };
}
