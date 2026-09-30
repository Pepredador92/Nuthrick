'use client';

import { useEffect } from 'react';
import { authReturnTarget } from './authReturn';

export function AuthReturnRedirect() {
  useEffect(() => {
    const target = authReturnTarget(window.location);
    if (target) window.location.replace(target);
  }, []);
  return null;
}
