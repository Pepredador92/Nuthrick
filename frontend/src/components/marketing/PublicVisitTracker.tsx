'use client';

import { useEffect } from 'react';
import { trackSiteVisit } from '@/src/services/siteAnalytics';
import { authReturnTarget } from '@/src/features/auth/authReturn';

/** The server-rendered landing does not mount ClientApplication. */
export function PublicVisitTracker({ path }: { path: string }) {
  useEffect(() => {
    if (!authReturnTarget(window.location)) trackSiteVisit(path);
  }, [path]);
  return null;
}
