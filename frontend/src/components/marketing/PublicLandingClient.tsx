"use client";

import { useEffect, useState } from 'react';
import { LandingPage } from '@/src/screens/LandingPage';
import { loadPublicCommercialData, type PublicPlan } from '@/src/lib/publicCommercial';

// React Router also reaches / after navigation from the private application.
export function PublicLandingClient() {
  const [data, setData] = useState<{ plans: PublicPlan[]; supportEmail: string | null }>({ plans: [], supportEmail: null });
  useEffect(() => {
    let active = true;
    void loadPublicCommercialData().then(result => { if (active) setData(result); });
    return () => { active = false; };
  }, []);
  return <LandingPage {...data} />;
}
