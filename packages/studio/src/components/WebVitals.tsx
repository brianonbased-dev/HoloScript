'use client';

import { useEffect } from 'react';

export function WebVitals() {
  useEffect(() => {
    // web-vitals v5 dropped `onFID` in favour of `onINP` (Core Web Vitals
    // promotion 2024-03). FID had been deprecated since v4. INP is now
    // the canonical Interaction-to-Next-Paint metric.
    import('web-vitals').then(({ onCLS, onLCP, onTTFB, onINP }) => {
      const { reportWebVitals } = require('@/app/web-vitals');
      onCLS(reportWebVitals);
      onLCP(reportWebVitals);
      onTTFB(reportWebVitals);
      onINP(reportWebVitals);
    }).catch(() => {
      // web-vitals not available — skip silently
    });
  }, []);

  return null;
}
