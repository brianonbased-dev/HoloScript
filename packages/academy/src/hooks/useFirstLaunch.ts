'use client';

/**
 * useFirstLaunch — detects first visit via localStorage.
 * Returns { isFirstLaunch, dismiss, retrigger }.
 */

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'holoscript-studio-tutorial-complete';

export function useFirstLaunch() {
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setIsFirstLaunch(true);
    } catch {
      // SSR or private mode — treat as first launch
      setIsFirstLaunch(true);
    }
  }, []);

  const dismiss = useCallback(() => {
    setIsFirstLaunch(false);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // intentionally swallowed: localStorage may be unavailable in private browsing or SSR
    }
  }, []);

  const retrigger = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // intentionally swallowed: localStorage may be unavailable in private browsing or SSR
    }
    setIsFirstLaunch(true);
  }, []);

  return { isFirstLaunch, dismiss, retrigger };
}
