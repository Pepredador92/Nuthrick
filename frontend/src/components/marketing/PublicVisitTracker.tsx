'use client';

import { useEffect } from 'react';
import { trackSiteVisit } from '@/src/services/siteAnalytics';

/** The server-rendered landing does not mount ClientApplication. */
export function PublicVisitTracker({ path }: { path: string }) {
  useEffect(() => { trackSiteVisit(path); }, [path]);
  return null;
}
