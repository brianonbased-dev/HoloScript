export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

export interface ViewportClassification {
  tier: ViewportTier;
  isPortrait: boolean;
}

export function classifyViewport(width: number, height: number): ViewportClassification {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const isPortrait = h >= w;

  if (w < 768) {
    return { tier: 'mobile', isPortrait };
  }

  if (w < 1100) {
    return { tier: 'tablet', isPortrait };
  }

  return { tier: 'desktop', isPortrait };
}
