// GAP-4.4: Core Web Vitals reporting
// Reports LCP, FID, CLS, TTFB, INP to console in dev, and can be wired to analytics

import type { Metric } from 'web-vitals';

const vitalsUrl = process.env.NEXT_PUBLIC_VITALS_URL;

function sendToAnalytics(metric: Metric) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(1)}ms (${metric.rating})`);
  }

  // Send to PostHog or custom endpoint if configured
  if (vitalsUrl) {
    const body = JSON.stringify({
      dsn: vitalsUrl,
      id: metric.id,
      page: window.location.pathname,
      href: window.location.href,
      event_name: metric.name,
      value: metric.value.toString(),
      rating: metric.rating,
      speed: (navigator as any).connection?.effectiveType || '',
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(vitalsUrl, body);
    } else {
      fetch(vitalsUrl, { body, method: 'POST', keepalive: true }).catch(() => {});
    }
  }
}

export function reportWebVitals(metric: Metric) {
  sendToAnalytics(metric);
}
