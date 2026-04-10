'use client';

import { useEffect } from 'react';

export function WebVitals() {
  useEffect(() => {
    import('web-vitals').then(({ onCLS, onFID, onLCP, onTTFB, onINP }) => {
      const { reportWebVitals } = require('@/app/web-vitals');
      onCLS(reportWebVitals);
      onFID(reportWebVitals);
      onLCP(reportWebVitals);
      onTTFB(reportWebVitals);
      onINP(reportWebVitals);
    }).catch(() => {
      // web-vitals not available — skip silently
    });
  }, []);

  return null;
}
